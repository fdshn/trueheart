import { IUserEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Repository } from 'typeorm';

export interface ICreateUserWithReferralParams {
  globalId: string;
  username: string;
  passwordHash: string;
  referralCode?: string;
  /**
   * Dấu vết đăng ký, để ghi vào `referrals` cùng lúc tạo quan hệ giới thiệu.
   *
   * Hai cột `signup_ip_hash` / `signup_device_hash` có từ migration đầu tiên và trước
   * 30/09 không dòng nào có giá trị — trong khi chúng là dữ liệu duy nhất để nhìn ra
   * một người tự tạo nhiều tài khoản. Trigger coi chúng là BẤT BIẾN, nên chỉ ghi được
   * ở đúng lần `INSERT` này; vá sau cho dữ liệu cũ là không thể.
   *
   * Đã băm tại tầng gọi — xem `hashSignupFingerprint`.
   */
  signupIpHash?: string | null;
  signupDeviceHash?: string | null;
}

export interface ICreateUserWithReferralResult {
  user: IUserEntity | null;
  referralApplied: boolean;
}

export interface IUserRepository extends Repository<IUserEntity> {
  /**
   * Tìm theo username, email hoặc số điện thoại — đăng nhập đa định danh (F02).
   *
   * Bỏ qua tài khoản đã xoá mềm.
   */
  findByIdentifier(identifier: string): Promise<IUserEntity | null>;

  /**
   * Nạp nhiều hồ sơ trong MỘT truy vấn — dùng cho feed, nơi mỗi trang có tới
   * 20 bài và hỏi từng tác giả là 20 lượt đi database mỗi lần cuộn.
   *
   * KHÔNG lọc `deletedAt`: tài khoản đã xoá vẫn giữ username, và bài cũ của
   * họ vẫn phải hiện đúng tên thay vì trống trơn.
   */
  findByGlobalIds(globalIds: string[]): Promise<IUserEntity[]>;

  createWithReferral(
    params: ICreateUserWithReferralParams,
  ): Promise<ICreateUserWithReferralResult>;

  /** `true` nếu đã có tài khoản dùng username này (không phân biệt hoa thường). */
  isUsernameTaken(username: string): Promise<boolean>;

  /** Hồ sơ công khai: chỉ tài khoản còn hoạt động, không bị xoá. */
  findActiveByUsername(username: string): Promise<IUserEntity | null>;

  isEmailTaken(email: string, exceptUserId: string): Promise<boolean>;
  isPhoneTaken(phone: string, exceptUserId: string): Promise<boolean>;

  /**
   * Đánh dấu tài khoản còn sống — nền cho "Active Member" (F56).
   *
   * Gọi ở MỌI lần cấp phiên, gồm cả làm mới token: app mobile giữ refresh token
   * nên người mở app hằng ngày vẫn có thể không nhập mật khẩu lần nào suốt 90
   * ngày, và chỉ ghi ở nhánh đăng nhập sẽ đánh nhầm họ thành không hoạt động.
   */
  touchActivity(userId: string): Promise<void>;
}

export const IUserRepository = Symbol('IUserRepository');
