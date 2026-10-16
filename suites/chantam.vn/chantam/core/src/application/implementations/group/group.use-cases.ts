import {
  ICreateGroupCommand,
  ICreateGroupResult,
  ICreateGroupUseCase,
  IGetOwnGroupCommand,
  IGetOwnGroupResult,
  IGetOwnGroupUseCase,
} from '@/application/contracts/group';
import {
  GroupDefaultLocationRequiredException,
  GroupNotFoundException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IGroupRepository,
} from '@/domain/ports/repository';
import {
  GroupDefaultRadiusConfigKey,
  GroupInviteCodeLength,
  GroupMaxRadiusConfigKey,
  GroupMinRadiusConfigKey,
  groupRadiusConfigKeyForRank,
} from '@chantam.vn/chantam.core-lib/consts';
import { resolveGroupRadiusKm } from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { GroupCreationEligibility } from './group-creation-eligibility';

/**
 * Sinh mã mời.
 *
 * Ngẫu nhiên MẬT MÃ, không phải `Math.random`: link mời không hết hạn và không
 * giới hạn lượt dùng, nên một mã đoán ra được là cửa mở vĩnh viễn vào nhóm.
 *
 * Bỏ chữ dễ nhìn nhầm (0/O, 1/I/l) vì mã này được đọc và gõ tay.
 */
const InviteAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeInviteCode(): string {
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
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
    private readonly eligibility: GroupCreationEligibility,
  ) {}

  public async handle(
    command: ICreateGroupCommand,
  ): Promise<ICreateGroupResult> {
    // Hồ sơ (chốt 2026-09-24), hạng, đã thuộc nhóm, Vị trí mặc định — đúng bộ luật
    // mà `GET /groups/me` báo trước cho app qua `groupCreation`.
    const owner = await this.eligibility.assertCanCreate(command.ownerId);

    // `capability.limit` CỐ Ý không còn tham gia vào bán kính. Nó là một ô số trần
    // Admin sửa được, không nói đơn vị, nằm giữa một hệ mà mọi khoá bán kính khác
    // đều đặt tên bằng mét — cách chắc nhất để nó không bị đọc sai là không đọc nó.
    //
    // Bán kính theo BẬC của người tạo (chốt 30/09). Đọc khoá riêng của bậc đó,
    // thiếu thì rơi về `group.default_radius_meters`. Bậc lấy từ `owner.rank` —
    // tức bậc TẠI THỜI ĐIỂM TẠO, đúng tinh thần snapshot của BR-GRP-03: tụt bậc
    // về sau không làm vùng nhóm co lại.
    const [defaultMeters, minMeters, maxMeters, rankMeters] = await Promise.all(
      [
        this.adminConfig.getConfigValue(GroupDefaultRadiusConfigKey),
        this.adminConfig.getConfigValue(GroupMinRadiusConfigKey),
        this.adminConfig.getConfigValue(GroupMaxRadiusConfigKey),
        this.adminConfig.getConfigValue(
          groupRadiusConfigKeyForRank(owner.rank as string),
        ),
      ],
    );
    const radiusConfig = { defaultMeters, minMeters, maxMeters, rankMeters };

    // Tâm nhóm CHỤP từ Vị trí mặc định và không đổi được về sau (BR-GRP-03).
    // `assertCanCreate` đã chặn ca thiếu; kiểm lại ở đây để kiểu dữ liệu nói đúng.
    const center = owner.defaultLocation;
    if (!center) throw new GroupDefaultLocationRequiredException();

    const groupId = randomUUID();
    await this.groups.createWithOwner({
      globalId: groupId,
      ownerId: command.ownerId,
      name: command.group.name.trim(),
      description: command.group.description?.trim() || null,
      avatarUrl: command.group.avatarUrl ?? null,
      coverUrl: command.group.coverUrl ?? null,
      centerLocation: center,
      regionLabel: command.group.regionLabel.trim(),
      // Bán kính snapshot từ cấu hình ĐỘNG, kẹp vào khoảng cho phép. Một giá trị
      // ngoài khoảng là lỗi cấu hình, không phải lỗi của người đang tạo nhóm.
      //
      // Trước 30/09 câu comment này nói "từ cấu hình" nhưng thật ra đọc
      // `capability.limit` của `CREATE_GROUP`, còn ba khoá `group.*_radius_meters`
      // thì chỉ nằm trong allowlist của Admin và KHÔNG ai đọc: Admin sửa được, lưu
      // được, và không gì thay đổi. Kèm một bẫy đơn vị — ô capability nhận số trần
      // rồi kẹp bằng cận km, nên đặt `10000` với ý "10 km" sẽ ra 50 km.
      radiusKm: resolveGroupRadiusKm({
        defaultMeters: radiusConfig.defaultMeters,
        minMeters: radiusConfig.minMeters,
        maxMeters: radiusConfig.maxMeters,
        rankMeters: radiusConfig.rankMeters,
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
    private readonly eligibility: GroupCreationEligibility,
  ) {}

  public async handle(
    command: IGetOwnGroupCommand,
  ): Promise<IGetOwnGroupResult> {
    // `null` chứ không phải 404: "bạn chưa thuộc nhóm nào" là một câu trả lời
    // hợp lệ, và màn hình Nhóm của tôi dùng nó để hiện nút Tạo nhóm — kèm
    // `groupCreation` để biết nút đó bấm được không, và vì sao không.
    const [group, groupCreation] = await Promise.all([
      this.groups.findMine(command.userId),
      this.eligibility.evaluate(command.userId),
    ]);
    return { group, groupCreation };
  }
}
