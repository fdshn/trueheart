import {
  ICreateGroupCommand,
  ICreateGroupResult,
  ICreateGroupUseCase,
  IGetOwnGroupCommand,
  IGetOwnGroupResult,
  IGetOwnGroupUseCase,
} from '@/application/contracts/group';
import { ProfileGate } from '@/application/implementations/profile/profile-gate';
import {
  GroupAlreadyMemberException,
  GroupCreateNotAllowedException,
  GroupDefaultLocationRequiredException,
  GroupNotFoundException,
} from '@/domain/exceptions';
import {
  IEntitlementRepository,
  IGroupRepository,
} from '@/domain/ports/repository';
import {
  DefaultGroupRadiusKm,
  GroupInviteCodeLength,
  MaxGroupRadiusKm,
  MinGroupRadiusKm,
} from '@chantam.vn/chantam.core-lib/consts';
import { normalizeGroupRadiusKm } from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';

/** Capability quyết ai được tạo nhóm. Baseline Kim Cương (BR-GRP-01). */
const CreateGroupCapability = 'CREATE_GROUP';

/**
 * Sinh mã mời.
 *
 * Ngẫu nhiên MẬT MÃ, không phải `Math.random`: link mời không hết hạn và không
 * giới hạn lượt dùng, nên một mã đoán ra được là cửa mở vĩnh viễn vào nhóm.
 *
 * Bỏ chữ dễ nhìn nhầm (0/O, 1/I/l) vì mã này được đọc và gõ tay.
 */
const InviteAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function makeInviteCode(): string {
  const bytes = randomBytes(GroupInviteCodeLength);

  return Array.from(bytes)
    .map((byte) => InviteAlphabet[byte % InviteAlphabet.length])
    .join('');
}

@Injectable()
export class CreateGroupUseCase implements ICreateGroupUseCase {
  public constructor(
    @Inject(IGroupRepository)
    private readonly groups: IGroupRepository,
    @Inject(IEntitlementRepository)
    private readonly entitlements: IEntitlementRepository,
    private readonly profileGate: ProfileGate,
  ) {}

  public async handle(
    command: ICreateGroupCommand,
  ): Promise<ICreateGroupResult> {
    // Cổng hồ sơ áp cho cả tạo Group (chốt 2026-09-24).
    const owner = await this.profileGate.assertOnboarded(command.ownerId);

    const capability = await this.entitlements.getCapability(
      command.ownerId,
      CreateGroupCapability,
    );
    if (!capability?.allowed) throw new GroupCreateNotAllowedException();

    // Kiểm membership TRƯỚC khi đụng vị trí: người đã thuộc nhóm thì không cần
    // biết mình thiếu Vị trí mặc định hay không.
    if (await this.groups.hasMembership(command.ownerId))
      throw new GroupAlreadyMemberException();

    // Tâm nhóm CHỤP từ Vị trí mặc định và không đổi được về sau (BR-GRP-03).
    // Thiếu vị trí thì không có gì để chụp.
    if (!owner.defaultLocation)
      throw new GroupDefaultLocationRequiredException();

    const groupId = randomUUID();
    await this.groups.createWithOwner({
      globalId: groupId,
      ownerId: command.ownerId,
      name: command.group.name.trim(),
      description: command.group.description?.trim() || null,
      avatarUrl: command.group.avatarUrl ?? null,
      coverUrl: command.group.coverUrl ?? null,
      centerLocation: owner.defaultLocation,
      regionLabel: command.group.regionLabel.trim(),
      // Bán kính snapshot từ cấu hình, kẹp vào khoảng cho phép. Một giá trị
      // ngoài khoảng là lỗi cấu hình, không phải lỗi của người đang tạo nhóm.
      radiusKm: normalizeGroupRadiusKm(capability.limit, DefaultGroupRadiusKm, {
        min: MinGroupRadiusKm,
        max: MaxGroupRadiusKm,
      }),
      inviteCode: makeInviteCode(),
      ownerMembershipId: randomUUID(),
    });

    const created = await this.groups.findMine(command.ownerId);
    if (!created) throw new GroupNotFoundException();

    return { group: created };
  }
}

@Injectable()
export class GetOwnGroupUseCase implements IGetOwnGroupUseCase {
  public constructor(
    @Inject(IGroupRepository)
    private readonly groups: IGroupRepository,
  ) {}

  public async handle(
    command: IGetOwnGroupCommand,
  ): Promise<IGetOwnGroupResult> {
    // `null` chứ không phải 404: "bạn chưa thuộc nhóm nào" là một câu trả lời
    // hợp lệ, và màn hình Nhóm của tôi dùng nó để hiện nút Tạo nhóm.
    return { group: await this.groups.findMine(command.userId) };
  }
}
