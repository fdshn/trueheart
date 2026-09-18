import { UserRanks, UserStatuses } from '../../consts';

/** Cặp token trả về sau khi đăng ký, đăng nhập hoặc làm mới phiên. */
export interface ISessionTokensDto {
  accessToken: string;
  refreshToken: string;
  /** Số giây còn lại của access token — client dùng để hẹn giờ tự refresh. */
  expiresIn: number;
}

/**
 * Bản rút gọn của tài khoản dành cho CHÍNH CHỦ.
 *
 * Khác với hồ sơ công khai (F10) — bản này có email và SĐT vì người xem là chủ
 * tài khoản. Tuyệt đối không dùng nó để trả hồ sơ của người khác.
 */
export interface IOwnUserDto {
  userId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  rank: UserRanks;
  status: UserStatuses;
  phoneVerified: boolean;
  /** Đủ Họ tên + Avatar + SĐT + Email để đăng bài chưa (F07). */
  profileComplete: boolean;
}

export interface IAuthResultDto {
  session: ISessionTokensDto;
  user: IOwnUserDto;
}

/**
 * Phản hồi của `GET /api/v1/auth/me` — đọc thẳng từ access token, KHÔNG tra
 * database.
 *
 * Cố ý hẹp hơn `IOwnUserDto`: token chỉ mang bốn trường này. Khai bằng
 * `IOwnUserDto` thì tài liệu hứa có `email`, `phone`, `fullName`... mà thực tế
 * không trả về.
 */
export interface ICurrentSessionDto {
  userId: string;
  username: string;
  rank: string;
  status: string;
}
