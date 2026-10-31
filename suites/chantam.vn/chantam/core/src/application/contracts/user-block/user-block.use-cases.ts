import {
  IBlockUserDto,
  IBlockUserResponseDto,
  IListBlockedUsersResponseDto,
  IUnblockUserResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IBlockUserCommand {
  /** Người bấm chặn. */
  userId: string;
  /** Người bị chặn — đúng một trong `userId`/`username`. */
  target: IBlockUserDto;
}

export interface IBlockUserUseCase extends IUseCase<
  IBlockUserCommand,
  IBlockUserResponseDto
> {}

export const IBlockUserUseCase = Symbol('IBlockUserUseCase');

export interface IUnblockUserCommand {
  userId: string;
  blockedUserId: string;
}

export interface IUnblockUserUseCase extends IUseCase<
  IUnblockUserCommand,
  IUnblockUserResponseDto
> {}

export const IUnblockUserUseCase = Symbol('IUnblockUserUseCase');

export interface IListBlockedUsersCommand {
  userId: string;
  page?: number;
  pageSize?: number;
}

export interface IListBlockedUsersUseCase extends IUseCase<
  IListBlockedUsersCommand,
  IListBlockedUsersResponseDto
> {}

export const IListBlockedUsersUseCase = Symbol('IListBlockedUsersUseCase');
