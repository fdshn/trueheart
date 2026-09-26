export type ClaimPhoneOutcome =
  /** Số chưa ai xác minh — vừa ghi tên người này vào. */
  | 'CLAIMED'
  /** Chính người này đã xác minh số này trước đó. Xác minh lại là bình thái. */
  | 'ALREADY_OWN'
  /** Đã có tài khoản KHÁC xác minh số này, kể cả tài khoản nay đã xoá. */
  | 'TAKEN';

export interface IVerifiedPhoneRepository {
  /**
   * Ghi nhận một số đã được xác minh, hoặc báo là số đó đã có chủ.
   *
   * Nhận số ở dạng E.164; việc băm nằm bên trong để không nơi nào ngoài đây
   * chạm tới số ở dạng đọc được.
   *
   * Phải chạy trong CÙNG transaction với việc đặt `users.phone_verified_at`:
   * tách ra thì hai request song song cùng vượt qua phép kiểm rồi cùng ghi.
   */
  claim(params: { phone: string; userId: string }): Promise<ClaimPhoneOutcome>;
}

export const IVerifiedPhoneRepository = Symbol('IVerifiedPhoneRepository');
