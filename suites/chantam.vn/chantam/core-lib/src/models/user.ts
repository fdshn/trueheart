import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import { UserRanks, UserStatuses } from '../consts';

/**
 * Tài khoản người dùng.
 *
 * Đăng ký chỉ cần `username` + mật khẩu (F01). Email, SĐT, họ tên và avatar đều
 * bổ sung sau — nhưng phải đủ cả bốn mới được đăng bài (F07).
 */
export interface IUser {
  /** Định danh đăng nhập, không đổi được sau khi tạo. */
  username: string;

  /** Chỉ lưu bản băm. Không bao giờ trả ra API. */
  passwordHash: string;

  email: string | null;
  phone: string | null;
  fullName: string | null;
  avatarUrl: string | null;

  /**
   * Vị trí mặc định do người dùng tự chọn và xác nhận (F11).
   *
   * KHÁC với vị trí GPS hiện tại: đây là giá trị mặc định khi đăng bài và là
   * điều kiện bắt buộc để tạo Group (F52).
   */
  defaultLocation: IGeoPoint | null;

  rank: UserRanks;
  status: UserStatuses;

  /**
   * Thời điểm xác minh SĐT lần đầu.
   *
   * Dùng làm khoá cho sự kiện thưởng một lần `PHONE_VERIFIED_FIRST_TIME` (F09):
   * đã có giá trị thì đổi SĐT về sau không thưởng lại.
   */
  phoneVerifiedAt: Date | null;

  /** Hết hạn treo. `null` khi không bị treo. Chỉ có nghĩa khi status = SUSPENDED. */
  suspendedUntil: Date | null;
}
