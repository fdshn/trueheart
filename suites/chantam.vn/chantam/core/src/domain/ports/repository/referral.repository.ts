export interface IReferralInvitee {
  /** Tên đăng nhập của người được mời — đã công khai qua trang hồ sơ. */
  readonly username: string;
  readonly fullName: string | null;
  /**
   * `PENDING` là đã đăng ký bằng mã nhưng chưa xong onboarding; `QUALIFIED` là đã
   * xong và lượt giới thiệu đã tính. Không có trạng thái thứ ba: một lượt đã tính
   * thì không quay lại được (trigger `enforce_referral_qualification_transition`).
   */
  readonly status: 'PENDING' | 'QUALIFIED';
  readonly invitedAt: Date;
  readonly qualifiedAt: Date | null;
  /** Số điểm lượt này mang lại, `null` khi chưa tính hoặc bị hoãn vì trần ngày. */
  readonly awardedPoints: number | null;
}

export interface IReferralSummary {
  code: string;
  totalCount: number;
  qualifiedCount: number;
  rewardedCount: number;
  /**
   * Danh sách người đã mời, mới nhất trước.
   *
   * [23 §23.3](../../../../../../docs/diagram/23-referral.md) vẽ endpoint này trả
   * *"Mã giới thiệu + danh sách đã mời + trạng thái"*, nhưng trước 30/09 nó chỉ trả
   * ba con số. Người mời không có cách nào biết AI đang kẹt ở `PENDING` — mà đó đúng
   * là thứ để họ nhắc người kia làm nốt onboarding, và là việc duy nhất họ còn làm
   * được sau khi đã gửi mã.
   */
  invitees: IReferralInvitee[];
}

export interface IReferralQualificationResult {
  readonly qualified: boolean;
  readonly referrerId?: string;
  /**
   * Số điểm đã ghi cho người giới thiệu.
   *
   * Lấy từ bút toán vừa ghi, không đọc lại `point_rules`: rule là cấu hình động
   * nên đọc lại có thể ra con số khác với con số đã vào sổ, và thông báo sẽ nói
   * sai.
   */
  readonly awardedPoints?: number;
}

export interface IReferralRepository {
  getOwnSummary(userId: string): Promise<IReferralSummary>;
  qualifyAndAward(params: {
    refereeId: string;
  }): Promise<IReferralQualificationResult>;

  /**
   * Lượt giới thiệu đã đủ điều kiện nhưng chưa được đánh dấu hợp lệ.
   *
   * Sinh ra khi `qualifyAndAward` hoãn vì rule bị tắt hoặc chạm trần ngày:
   * trigger database đòi "đã hợp lệ" phải đi kèm một bút toán, nên cách đúng là
   * để nguyên rồi thử lại, chứ không phải ghi hợp lệ mà không có thưởng.
   *
   * Trả về id NGƯỜI ĐƯỢC GIỚI THIỆU vì đó là khoá mà `qualifyAndAward` nhận.
   *
   * KHÔNG trả về lượt mà người mời đã bị khoá hoặc xoá: nếu trả thì `point:reconcile`
   * thử lại mãi cho một khoản sẽ không bao giờ được ghi, mỗi lượt một dòng log lỗi.
   * Người mời bị treo tạm rồi được gỡ thì lượt đó lại xuất hiện ở đây — hoãn, không mất.
   */
  findPendingQualifications(limit: number): Promise<string[]>;

  /**
   * Số cụm dấu vết đăng ký TRÙNG NHAU trong danh sách người mà một người đã mời.
   *
   * Đếm theo `signup_ip_hash` và `signup_device_hash`: hai người được mời cùng dấu
   * vết là tín hiệu một người tự tạo nhiều tài khoản — đúng rủi ro mà
   * [23 §Chỗ cần soát](../../../../../../docs/diagram/23-referral.md) mục 3 nói tới.
   *
   * Chỉ ĐẾM và cho Admin xem, không tự xử: ngưỡng bao nhiêu là đáng chặn và chặn thế
   * nào là quyết định nghiệp vụ, và một quy tắc tự động đoán sai sẽ khoá oan người
   * dùng chung một mạng gia đình hoặc một máy trong tiệm net.
   */
  countSharedSignupFingerprints(referrerId: string): Promise<number>;
}

export const IReferralRepository = Symbol('IReferralRepository');
