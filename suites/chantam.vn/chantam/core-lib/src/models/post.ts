import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import {
  CharityTransferStatuses,
  GiftPostStatuses,
  PostTypes,
} from '../consts';
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
  /** Bài Cần gấp / SOS — mở theo capability `POST_SOS` của Rank (F17). */
  isSos: boolean;
  /** Yêu cầu chuyển vật phẩm về điểm từ thiện, chờ Admin duyệt (F23). */
  charityTransferStatus: CharityTransferStatuses | null;
  charityTransferRequestedAt: Date | null;
  charityTransferNote: string | null;
}
