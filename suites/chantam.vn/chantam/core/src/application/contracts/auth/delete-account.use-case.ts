import {
  IDeleteAccountBodyDto,
  IDeleteAccountResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IDeleteAccountCommand extends IDeleteAccountBodyDto {
  /** `globalId` của người gọi, lấy từ access token chứ không từ body. */
  userId: string;
}

export interface IDeleteAccountResult extends IDeleteAccountResponseDto {}

export interface IDeleteAccountUseCase extends IUseCase<
  IDeleteAccountCommand,
  IDeleteAccountResult
> {}

export const IDeleteAccountUseCase = Symbol('IDeleteAccountUseCase');
