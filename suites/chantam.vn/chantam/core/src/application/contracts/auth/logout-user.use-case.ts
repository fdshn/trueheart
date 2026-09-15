import {
  ILogoutBodyDto,
  ILogoutResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface ILogoutUserCommand extends ILogoutBodyDto {
  /** `globalId` của người gọi, lấy từ access token chứ không từ body. */
  userId: string;
}

export interface ILogoutUserResult extends ILogoutResponseDto {}

export interface ILogoutUserUseCase extends IUseCase<
  ILogoutUserCommand,
  ILogoutUserResult
> {}

export const ILogoutUserUseCase = Symbol('ILogoutUserUseCase');
