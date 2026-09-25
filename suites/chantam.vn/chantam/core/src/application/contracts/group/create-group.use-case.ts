import {
  GroupMemberRoles,
  GroupStatuses,
} from '@chantam.vn/chantam.core-lib/consts';
import { IUseCase } from '@chantam/service.common-lib/use-case';

export interface ICreateGroupCommand {
  readonly ownerId: string;
  readonly group: {
    readonly name: string;
    readonly description?: string;
    readonly avatarUrl?: string;
    readonly coverUrl?: string;
    readonly regionLabel: string;
  };
}

export interface IGroupSummaryResult {
  readonly groupId: string;
  readonly ownerId: string;
  readonly name: string;
  readonly regionLabel: string;
  readonly radiusKm: number;
  readonly status: GroupStatuses;
  readonly memberCount: number;
  /** Chỉ Owner nhận được — link mời là cửa vào nhóm. */
  readonly inviteCode: string | null;
  readonly myRole: GroupMemberRoles | null;
}

export interface ICreateGroupResult {
  readonly group: IGroupSummaryResult;
}

export interface ICreateGroupUseCase extends IUseCase<
  ICreateGroupCommand,
  ICreateGroupResult
> {}

export const ICreateGroupUseCase = Symbol('ICreateGroupUseCase');

export interface IGetOwnGroupCommand {
  readonly userId: string;
}

export interface IGetOwnGroupResult {
  /** `null` khi chưa thuộc nhóm nào. */
  readonly group: IGroupSummaryResult | null;
}

export interface IGetOwnGroupUseCase extends IUseCase<
  IGetOwnGroupCommand,
  IGetOwnGroupResult
> {}

export const IGetOwnGroupUseCase = Symbol('IGetOwnGroupUseCase');
