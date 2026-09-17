import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import { GiftPostCategories, GiftPostConditions } from '../../consts';
import { IGiftPostEntity } from '../../entities';

export interface ICreateGiftPostDto {
  title: string;
  description: string;
  category: GiftPostCategories;
  condition: GiftPostConditions;
  estimatedValue: number;
  location: IGeoPoint;
  areaLabel: string;
  /** Mặc định 1. Lớn hơn 1 kích hoạt kịch bản phân bổ M-to-N. */
  totalQuantity?: number;
}

/**
 * Body luôn bọc dưới khoá resource (INVARIANTS.md mục 6).
 *
 * Nhờ vậy về sau thêm trường cấp bao ngoài (idempotency key, metadata client)
 * không phá vỡ hợp đồng đã có.
 */
export interface ICreateGiftPostBodyDto {
  giftPost: ICreateGiftPostDto;
}

export interface ICreateGiftPostResponseDto {
  giftPost: IGiftPostEntity;
}
