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
   * Chế độ tìm người nhận. Có ý nghĩa với **cả** `OFFER` và `WANTED` (CHỐT-10).
   * - `INSTANT` — chốt ngay phản hồi hợp lệ đầu tiên.
   * - `OPTIMAL` — tiếp nhận ứng viên tới hết hạn xét rồi mới chọn.
   */
  selectionMode: PostSelectionModes;
  /**
   * Hạn xét ứng viên = **lúc đăng + 7 ngày** (CHỐT-10).
   *
   * Đặt ngay khi bài lên công khai, cho mọi chế độ. Tới 06/10 nó là `null` cho
   * đến khi có phản hồi đầu tiên — nên bài không ai xin thì không bao giờ tới
   * hạn. `null` nay chỉ còn nghĩa "bài chưa công khai", hoặc "đã ghép được người
   * nên đồng hồ đã dừng".
   */
  selectionDeadline: Date | null;
}
