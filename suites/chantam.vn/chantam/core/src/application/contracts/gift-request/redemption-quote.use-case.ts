import { IRedemptionQuoteResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetRedemptionQuoteCommand {
  postId: string;
  /** Người gọi; báo giá phụ thuộc số điểm và hạng của chính họ. */
  userId: string;
}

export type IGetRedemptionQuoteResult = IRedemptionQuoteResponseDto;

export interface IGetRedemptionQuoteUseCase extends IUseCase<
  IGetRedemptionQuoteCommand,
  IGetRedemptionQuoteResult
> {}

export const IGetRedemptionQuoteUseCase = Symbol('IGetRedemptionQuoteUseCase');
