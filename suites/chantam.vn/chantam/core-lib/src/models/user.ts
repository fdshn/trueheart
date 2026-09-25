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

  /**
   * Thời điểm xác minh email.
   *
   * `null` nghĩa là địa chỉ mới chỉ được gõ vào hồ sơ, chưa ai chứng minh là
   * của mình — và email chưa xác minh KHÔNG được làm kênh đặt lại mật khẩu.
   * Đổi email thì mốc này về `null`.
   */
  emailVerifiedAt: Date | null;

  /** Hết hạn treo. `null` khi không bị treo. Chỉ có nghĩa khi status = SUSPENDED. */
  suspendedUntil: Date | null;

  /**
   * Lần cuối tài khoản còn sống — nền cho định nghĩa "Active Member" (F56).
   *
   * Ghi ở MỌI lần cấp phiên, gồm cả làm mới token, không chỉ lúc nhập mật khẩu.
   * App mobile giữ refresh token nên người mở app hằng ngày vẫn có thể không
   * "đăng nhập" lần nào suốt 90 ngày.
   */
  lastActiveAt: Date;
}

/**
 * Hồ sơ đã đủ để đăng bài chưa (F07).
 *
 * Bốn trường này là điều kiện cổng: Họ tên, Avatar, SĐT, Email. Đặt ở `core-lib`
 * để service, Admin CMS và app di động dùng chung MỘT định nghĩa — nếu mỗi nơi
 * tự kiểm, sớm muộn chúng sẽ lệch nhau.
 */
export function isProfileComplete(
  user: Pick<IUser, 'fullName' | 'avatarUrl' | 'phone' | 'email'>,
): boolean {
  return missingProfileFields(user).length === 0;
}

/**
 * Những trường còn thiếu, theo đúng tên người dùng nhìn thấy trên form.
 *
 * Trả danh sách chứ không chỉ true/false vì thông báo "hồ sơ chưa đủ" bắt người
 * dùng tự đoán mình thiếu gì, và mỗi lần đoán sai là một lần họ bỏ cuộc.
 *
 * Thứ tự cố định theo thứ tự trường trên form, để hai màn hình khác nhau không
 * đọc ra hai thứ tự khác nhau cho cùng một hồ sơ.
 */
export function missingProfileFields(
  user: Pick<IUser, 'fullName' | 'avatarUrl' | 'phone' | 'email'>,
): string[] {
  return [
    !user.fullName && 'Họ tên',
    !user.avatarUrl && 'Avatar',
    !user.phone && 'SĐT',
    !user.email && 'Email',
  ].filter((label): label is string => typeof label === 'string');
}
