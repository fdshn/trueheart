import {
  IGiftTransactionResponseDto,
  IRequestGiftDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IRequestGiftCommand {
  /** Người nhận, luôn lấy từ token đã xác thực. */
  userId: string;
  giftRequest: IRequestGiftDto;
}

export type IRequestGiftResult = IGiftTransactionResponseDto;

export interface IRequestGiftUseCase extends IUseCase<
  IRequestGiftCommand,
  IRequestGiftResult
> {}

export const IRequestGiftUseCase = Symbol('IRequestGiftUseCase');
