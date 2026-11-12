import { IGiftRequestDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IOfferGiftCommand {
  /** Bài Muốn Nhận được nhắm tới. */
  wantedPostId: string;
  /** Người chủ động mang đồ tới. */
  offererId: string;
  message: string;
  /** Bài Muốn Tặng mang ra, không bắt buộc. */
  offeringPostId?: string;
  /** Số món mang tới; bỏ trống = 1. Không vượt số bài còn cần. */
  requestedQuantity?: number;
}

export interface IOfferGiftResult {
  request: IGiftRequestDto;
}

export type IOfferGiftUseCase = IUseCase<IOfferGiftCommand, IOfferGiftResult>;

export const IOfferGiftUseCase = Symbol('IOfferGiftUseCase');
