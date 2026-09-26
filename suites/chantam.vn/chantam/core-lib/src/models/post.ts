import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import {
  CharityTransferStatuses,
  DeliveryMethods,
  GiftPostStatuses,
  PostSelectionModes,
  PostTypes,
  ShipPayers,
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
  /**
   * Ba cột đếm tương tác, cập nhật trong cùng transaction với lần ghi cảm xúc/
   * bình luận/chia sẻ. Đọc từ đây chứ không COUNT(*) mỗi lần cuộn bảng tin.
   */
  reactionCount: number;
  commentCount: number;
  shareCount: number;
  /** Bài Cần gấp / SOS — mở theo capability `POST_SOS` của Rank (F17). */
  isSos: boolean;
  /** Hình thức nhận hàng (F78). `null` khi người đăng chưa chọn. */
  deliveryMethod: DeliveryMethods | null;
  /**
   * Bên chịu phí ship (CH-2). Chỉ có nghĩa khi `deliveryMethod` là
   * `GIVER_SHIPS` — tự đến lấy thì không có phí để mà trả.
   */
  shipPayer: ShipPayers | null;
  /** Yêu cầu chuyển vật phẩm về điểm từ thiện, chờ Admin duyệt (F23). */
  charityTransferStatus: CharityTransferStatuses | null;
  charityTransferRequestedAt: Date | null;
  charityTransferNote: string | null;
  /**
   * Chế độ tìm người nhận. Chỉ có ý nghĩa với bài OFFER.
   * - INSTANT  — chọn ngay người đầu tiên gửi yêu cầu hợp lệ.
   * - OPTIMAL  — chờ tối đa 7 ngày kể từ request đầu tiên.
   * - EXTENDED — chờ tối đa 30 ngày kể từ request đầu tiên.
   */
  selectionMode: PostSelectionModes;
  /**
   * Thời điểm kết thúc giai đoạn chờ chọn người nhận.
   * - null cho đến khi có request đầu tiên (hoặc INSTANT mode).
   * - Được set = NOW() + 7d / 30d khi request đầu tiên xuất hiện.
   */
  selectionDeadline: Date | null;
}
