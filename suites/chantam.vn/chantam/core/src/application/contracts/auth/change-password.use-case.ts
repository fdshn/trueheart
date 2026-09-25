import {
  IChangePasswordBodyDto,
  IChangePasswordResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IChangePasswordCommand extends IChangePasswordBodyDto {
  /** `globalId` của người gọi, lấy từ access token chứ không từ body. */
  userId: string;
}

export interface IChangePasswordResult extends IChangePasswordResponseDto {}

export interface IChangePasswordUseCase extends IUseCase<
  IChangePasswordCommand,
  IChangePasswordResult
> {}

export const IChangePasswordUseCase = Symbol('IChangePasswordUseCase');
