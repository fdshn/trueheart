import { GroupMemberRoles } from '@chantam.vn/chantam.core-lib/consts';
import { IUseCase } from '@chantam/service.common-lib/use-case';

export interface IListGroupMembersCommand {
  readonly userId: string;
  readonly groupId: string;
  readonly page?: number;
  readonly limit?: number;
}

export interface IGroupMemberItemResult {
  readonly userId: string;
  readonly username: string;
  readonly role: GroupMemberRoles;
  readonly subTeamId: string | null;
  readonly subTeamName: string | null;
  readonly joinedAt: Date;
}

export interface IListGroupMembersResult {
  readonly members: IGroupMemberItemResult[];
  readonly total: number;
}

export interface IListGroupMembersUseCase extends IUseCase<
  IListGroupMembersCommand,
  IListGroupMembersResult
> {}

export const IListGroupMembersUseCase = Symbol('IListGroupMembersUseCase');

export interface ICreateSubTeamCommand {
  readonly userId: string;
  readonly groupId: string;
  readonly name: string;
}

export interface ISubTeamItemResult {
  readonly subTeamId: string;
  readonly name: string;
  readonly memberCount: number;
}

export interface IListSubTeamsResult {
  readonly subTeams: ISubTeamItemResult[];
}

export interface ICreateSubTeamUseCase extends IUseCase<
  ICreateSubTeamCommand,
  IListSubTeamsResult
> {}

export const ICreateSubTeamUseCase = Symbol('ICreateSubTeamUseCase');

export interface IListSubTeamsCommand {
  readonly userId: string;
  readonly groupId: string;
}

export interface IListSubTeamsUseCase extends IUseCase<
  IListSubTeamsCommand,
  IListSubTeamsResult
> {}

export const IListSubTeamsUseCase = Symbol('IListSubTeamsUseCase');

export interface IAssignGroupMemberCommand {
  readonly userId: string;
  readonly groupId: string;
  readonly memberId: string;
  /**
   * `undefined` để GIỮ tổ hiện tại, `null` để gỡ khỏi tổ.
   *
   * Phân biệt hai thứ này là bắt buộc, không phải tiểu tiết: gộp lại thì không
   * có cách nào đổi vai mà giữ tổ, và phong trưởng tổ cho ai sẽ gỡ họ khỏi đúng
   * cái tổ họ sắp quản.
   */
  readonly subTeamId?: string | null;
  /** Bỏ trống để giữ nguyên vai. `OWNER` không gán được. */
  readonly role?: GroupMemberRoles;
}

export interface IAssignGroupMemberResult {
  readonly members: IGroupMemberItemResult[];
  readonly total: number;
}

export interface IAssignGroupMemberUseCase extends IUseCase<
  IAssignGroupMemberCommand,
  IAssignGroupMemberResult
> {}

export const IAssignGroupMemberUseCase = Symbol('IAssignGroupMemberUseCase');
