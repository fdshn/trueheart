import { IGiftRequestDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IUpdateGiftRequestQuantityCommand {
  postId: string;
  requesterId: string;
  /** Số mới — chỉ được NHỎ HƠN số đang xin. */
  requestedQuantity: number;
}

export interface IUpdateGiftRequestQuantityResult {
  request: IGiftRequestDto;
}

export type IUpdateGiftRequestQuantityUseCase = IUseCase<
  IUpdateGiftRequestQuantityCommand,
  IUpdateGiftRequestQuantityResult
>;

export const IUpdateGiftRequestQuantityUseCase = Symbol(
  'IUpdateGiftRequestQuantityUseCase',
);
