import { IGiftRequestDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface ICreateGiftRequestCommand {
  postId: string;
  requesterId: string;
  message: string;
}

export interface ICreateGiftRequestResult {
  request: IGiftRequestDto;
}

export type ICreateGiftRequestUseCase = IUseCase<
  ICreateGiftRequestCommand,
  ICreateGiftRequestResult
>;

export const ICreateGiftRequestUseCase = Symbol('ICreateGiftRequestUseCase');
