import {
  GroupCreationBlockReason,
  IGroupCreationEligibility,
} from '@/application/contracts/group';
import {
  GroupAlreadyMemberException,
  GroupCreateNotAllowedException,
  GroupDefaultLocationRequiredException,
  OnboardingIncompleteException,
  ProfileIncompleteException,
  UserNotFoundException,
} from '@/domain/exceptions';
import {
  IEntitlementRepository,
  IGroupRepository,
  IUserRepository,
} from '@/domain/ports/repository';
import {
  ProfileFieldKey,
  UserRanks,
} from '@chantam.vn/chantam.core-lib/consts';
import { IUserEntity } from '@chantam.vn/chantam.core-lib/entities';
import { missingProfileFieldKeys } from '@chantam.vn/chantam.core-lib/models';
import { Inject, Injectable } from '@nestjs/common';

export const CreateGroupCapability = 'CREATE_GROUP';

interface IEvaluation extends IGroupCreationEligibility {
  readonly owner: IUserEntity;
  readonly missingProfileFields: ProfileFieldKey[];
}

/**
 * MỘT nơi duy nhất quyết định ai tạo được nhóm (SRS 3.7A).
 *
 * `POST /groups` ném theo nó, còn `GET /groups/me` và `GET /me/entitlements` trả nó
 * cho app hiện nút. Hai bản sao của bộ luật này là hai chỗ để lệch: app nói "tạo
 * được", bấm vào thì bị từ chối vì một điều kiện chỉ một bên biết.
 *
 * Thứ tự kiểm giữ đúng như `CreateGroupUseCase` trước đây: hồ sơ → onboarding → hạng
 * (entitlement `CREATE_GROUP`, lấy từ cấu hình hạng, không hard-code) → đã thuộc nhóm
 * → Vị trí mặc định. Người đã thuộc nhóm thì không cần biết mình thiếu vị trí.
 */
@Injectable()
export class GroupCreationEligibility {
  public constructor(
    @Inject(IUserRepository) private readonly users: IUserRepository,
    @Inject(IEntitlementRepository)
    private readonly entitlements: IEntitlementRepository,
    @Inject(IGroupRepository) private readonly groups: IGroupRepository,
  ) {}

  public async evaluate(userId: string): Promise<IGroupCreationEligibility> {
    const { canCreateGroup, reasonCode } = await this.run(userId);
    return { canCreateGroup, reasonCode };
  }

  /** Như `evaluate`, nhưng ném đúng ngoại lệ của lý do chặn và trả người tạo. */
  public async assertCanCreate(userId: string): Promise<IUserEntity> {
    const evaluation = await this.run(userId);
    switch (evaluation.reasonCode) {
      case null:
        return evaluation.owner;
      case 'PROFILE_INCOMPLETE':
        throw new ProfileIncompleteException(evaluation.missingProfileFields);
      case 'ONBOARDING_INCOMPLETE':
        throw new OnboardingIncompleteException();
      case 'GROUP_CREATE_NOT_ALLOWED':
        throw new GroupCreateNotAllowedException();
      case 'GROUP_ALREADY_MEMBER':
        throw new GroupAlreadyMemberException();
      case 'GROUP_DEFAULT_LOCATION_REQUIRED':
        throw new GroupDefaultLocationRequiredException();
    }
  }

  private async run(userId: string): Promise<IEvaluation> {
    const owner = await this.users.findOneBy({ globalId: userId });
    if (!owner || owner.deletedAt) throw new UserNotFoundException();

    const blocked = (
      reasonCode: GroupCreationBlockReason,
      missing: ProfileFieldKey[] = [],
    ): IEvaluation => ({
      canCreateGroup: false,
      reasonCode,
      owner,
      missingProfileFields: missing,
    });

    const missing = missingProfileFieldKeys(owner);
    if (missing.length > 0) return blocked('PROFILE_INCOMPLETE', missing);
    if (owner.rank === UserRanks.VIEWER)
      return blocked('ONBOARDING_INCOMPLETE');

    const capability = await this.entitlements.getCapability(
      userId,
      CreateGroupCapability,
    );
    if (!capability?.allowed) return blocked('GROUP_CREATE_NOT_ALLOWED');

    if (await this.groups.hasMembership(userId))
      return blocked('GROUP_ALREADY_MEMBER');

    if (!owner.defaultLocation)
      return blocked('GROUP_DEFAULT_LOCATION_REQUIRED');

    return {
      canCreateGroup: true,
      reasonCode: null,
      owner,
      missingProfileFields: [],
    };
  }
}
