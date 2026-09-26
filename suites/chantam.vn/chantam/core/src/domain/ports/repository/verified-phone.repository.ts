export type ClaimPhoneOutcome =
  /** Số chưa ai xác minh — vừa ghi tên người này vào. */
  | 'CLAIMED'
  /** Chính người này đã xác minh số này trước đó. Xác minh lại là bình thái. */
  | 'ALREADY_OWN'
  /** Đã có tài khoản KHÁC xác minh số này, kể cả tài khoản nay đã xoá. */
  | 'TAKEN';

export interface IVerifiedPhoneHolder {
  readonly userId: string;
  readonly username: string;
  readonly verifiedAt: Date;
  /** Tài khoản giữ số còn sống hay đã xoá mềm. */
  readonly holderDeleted: boolean;
  /** Tài khoản đó CÓ CÒN đang mang dấu xác minh cho chính số này không. */
  readonly stillVerified: boolean;
}

export type ReleasePhoneOutcome =
  | { status: 'RELEASED'; holder: IVerifiedPhoneHolder }
  /** Số chưa từng xác minh, hoặc đã được giải phóng trước đó. */
  | { status: 'NOT_FOUND' }
  /** Người giữ còn sống và vẫn đang xác minh — không giải phóng ngang được. */
  | { status: 'IN_USE'; holder: IVerifiedPhoneHolder };

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

  /**
   * Van xả của Admin: trả một số về trạng thái chưa ai xác minh.
   *
   * Mất máy, đổi số, số bị nhà mạng thu hồi rồi cấp cho người khác — đều là
   * chuyện sẽ xảy ra, và không có van thì người dùng thật bị khoá vĩnh viễn
   * khỏi chính số của mình.
   *
   * TỪ CHỐI khi người đang giữ còn sống và vẫn mang dấu xác minh cho số đó:
   * giải phóng lúc ấy là để hai tài khoản cùng "đã xác minh" một SIM, đúng thứ
   * cả cơ chế này dựng ra để chặn. Admin phải xử lý tài khoản kia trước.
   *
   * Hàng cũ GIỮ LẠI, chỉ đánh dấu `released_at` — xoá đi là mất dấu vết ai từng
   * giữ số nào, thứ duy nhất tra lại được khi có tranh chấp.
   */
  release(params: {
    phone: string;
    actorUserId: string;
    reason: string;
  }): Promise<ReleasePhoneOutcome>;
}

export const IVerifiedPhoneRepository = Symbol('IVerifiedPhoneRepository');
