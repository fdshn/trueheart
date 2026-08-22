import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import {
  GiftPostCategories,
  GiftPostConditions,
  GiftPostStatuses,
} from '../consts';

/**
 * Bài đăng cho tặng — thuộc tính nghiệp vụ thuần, không dính hạ tầng.
 *
 * Đây là mẫu tham chiếu cho mọi resource khác của hệ thống.
 */
export interface IGiftPost {
  title: string;
  description: string;
  category: GiftPostCategories;
  condition: GiftPostConditions;

  /**
   * Giá trị ước tính (VNĐ). Dùng để quy đổi điểm cống hiến theo đặc tả mục 2.2
   * (100.000đ = 1 điểm).
   *
   * Đây là giá trị **người đăng tự khai** — không được tin tuyệt đối. Điểm chỉ
   * ghi nhận sau khi người nhận xác nhận đã nhận, và phải chặn trần theo bảng
   * giá danh mục do Admin cấu hình.
   */
  estimatedValue: number;

  /** Vị trí trao đồ. Không bao giờ trả nguyên vẹn cho người chưa được duyệt. */
  location: IGeoPoint;

  /** Mô tả khu vực để hiển thị công khai, ví dụ "Quận 1, TP.HCM". */
  areaLabel: string;

  status: GiftPostStatuses;

  /** Tổng số lượng vật phẩm (đặc tả mục 3.3 — kịch bản M-to-N). */
  totalQuantity: number;

  /** Số lượng còn lại. Trừ dần nguyên tử mỗi khi duyệt một người nhận. */
  remainingQuantity: number;

  /** `globalId` của thành viên đăng bài. */
  giverId: string;
}
