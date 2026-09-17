import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import { GiftPostStatuses, PostTypes } from '../consts';
export interface IPost {
  postType: PostTypes;
  authorId: string;
  categoryId: string;
  title: string;
  description: string;
  location: IGeoPoint;
  areaLabel: string;
  status: GiftPostStatuses;
  totalQuantity: number;
  remainingQuantity: number;
  details: Record<string, unknown>;
  expiresAt: Date | null;
  renewedCount: number;
}
