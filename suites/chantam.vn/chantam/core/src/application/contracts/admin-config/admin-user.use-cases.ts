import { IAdminUserQuery, IAdminUserSummary } from '@/domain/ports/repository';
import { UserStatuses } from '@chantam.vn/chantam.core-lib/consts';
import { IUseCase } from '@chantam/service.common-lib';
import { IPaginationMetaDto } from '@chantam/service.common-lib/dto';

export type IListAdminUsersFilter = Omit<IAdminUserQuery, 'skip' | 'take'>;

export interface IListAdminUsersCommand extends IListAdminUsersFilter {
  actorUserId: string;
  page: number;
  pageSize: number;
}
export interface IListAdminUsersResult {
  users: IAdminUserSummary[];
  meta: IPaginationMetaDto;
}
export interface IListAdminUsersUseCase extends IUseCase<
  IListAdminUsersCommand,
  IListAdminUsersResult
> {}
export const IListAdminUsersUseCase = Symbol('IListAdminUsersUseCase');

export interface IGetAdminUserCommand {
  actorUserId: string;
  targetUserId: string;
}
export interface IGetAdminUserResult {
  user: IAdminUserSummary;
}
export interface IGetAdminUserUseCase extends IUseCase<
  IGetAdminUserCommand,
  IGetAdminUserResult
> {}
export const IGetAdminUserUseCase = Symbol('IGetAdminUserUseCase');

export interface IChangeUserStatusDto {
  status: UserStatuses;
  /** Chỉ dùng cho SUSPENDED; các trạng thái khác bỏ qua. */
  suspendedUntil?: Date | null;
  reason: string;
}

export interface IChangeAdminUserStatusCommand {
  actorUserId: string;
  targetUserId: string;
  statusChange: IChangeUserStatusDto;
}
export interface IChangeAdminUserStatusResult {
  user: IAdminUserSummary;
  revokedSessions: number;
}
export interface IChangeAdminUserStatusUseCase extends IUseCase<
  IChangeAdminUserStatusCommand,
  IChangeAdminUserStatusResult
> {}
export const IChangeAdminUserStatusUseCase = Symbol(
  'IChangeAdminUserStatusUseCase',
);

export interface IDeleteAdminUserDto {
  reason: string;
}

export interface IDeleteAdminUserCommand {
  actorUserId: string;
  targetUserId: string;
  deletion: IDeleteAdminUserDto;
}
export interface IDeleteAdminUserResult {
  user: IAdminUserSummary;
  revokedSessions: number;
}
export interface IDeleteAdminUserUseCase extends IUseCase<
  IDeleteAdminUserCommand,
  IDeleteAdminUserResult
> {}
export const IDeleteAdminUserUseCase = Symbol('IDeleteAdminUserUseCase');

export interface IReleaseVerifiedPhoneDto {
  /** Số ở bất kỳ cách gõ nào; server nắn về E.164 rồi mới tra. */
  phone: string;
  reason: string;
}

export interface IReleaseVerifiedPhoneCommand {
  actorUserId: string;
  release: IReleaseVerifiedPhoneDto;
}

export interface IReleaseVerifiedPhoneResult {
  /** Số đã nắn, trả lại để Admin đối chiếu mình gõ đúng số chưa. */
  phone: string;
  /** Tài khoản từng giữ số này. */
  previousHolder: {
    userId: string;
    username: string;
    verifiedAt: Date;
    holderDeleted: boolean;
  };
}

export interface IReleaseVerifiedPhoneUseCase extends IUseCase<
  IReleaseVerifiedPhoneCommand,
  IReleaseVerifiedPhoneResult
> {}
export const IReleaseVerifiedPhoneUseCase = Symbol(
  'IReleaseVerifiedPhoneUseCase',
);
