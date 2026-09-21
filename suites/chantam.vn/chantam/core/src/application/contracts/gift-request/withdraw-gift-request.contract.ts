import { IGiftRequestDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IWithdrawGiftRequestCommand {
  postId: string;
  requesterId: string;
}

export interface IWithdrawGiftRequestResult {
  request: IGiftRequestDto;
}

export type IWithdrawGiftRequestUseCase = IUseCase<
  IWithdrawGiftRequestCommand,
  IWithdrawGiftRequestResult
>;

export const IWithdrawGiftRequestUseCase = Symbol(
  'IWithdrawGiftRequestUseCase',
);
