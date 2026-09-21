import { IAcceptGiftRequestResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IAcceptGiftRequestCommand {
  postId: string;
  requestId: string;
  userId: string;
}

export interface IAcceptGiftRequestResult extends IAcceptGiftRequestResponseDto {}

export type IAcceptGiftRequestUseCase = IUseCase<
  IAcceptGiftRequestCommand,
  IAcceptGiftRequestResult
>;

export const IAcceptGiftRequestUseCase = Symbol('IAcceptGiftRequestUseCase');
