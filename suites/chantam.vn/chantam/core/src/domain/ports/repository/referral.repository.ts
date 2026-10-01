import { IReferralAbuseConfig } from '@chantam.vn/chantam.core-lib/models';

export interface IReferralFingerprintSignals {
  /**
   * Số cụm địa chỉ IP trùng nhau. Đọc để biết, KHÔNG dùng để lọc.
   *
   * Mạng di động Việt Nam dùng CGNAT nên hàng nghìn người không liên quan gì nhau chia
   * một IPv4; thêm wifi gia đình, quán cà phê, tiệm net, ký túc xá. IP trùng là chuyện
   * THƯỜNG, nhưng khi đọc cùng số cụm thiết bị thì nó vẫn giúp Admin hình dung.
   */
  readonly sharedIpClusters: number;
  /** Số cụm thiết bị trùng nhau — tín hiệu mạnh hơn IP nhiều. */
  readonly sharedDeviceClusters: number;
  /**
   * Số người trong cụm LỚN NHẤT (mọi loại dấu vết), `0` khi không có cụm nào.
   *
   * "Ba cụm, mỗi cụm hai người" và "một cụm mười một người" là hai hình dạng rất khác
   * nhau mà riêng số cụm không phân biệt được — cái thứ hai đáng xem hơn nhiều nhưng lại
   * có số cụm NHỎ hơn.
   */
  readonly largestClusterSize: number;
}

export interface IReferralReviewInvitee {
  readonly refereeUserId: string;
  readonly username: string;
  readonly status: 'PENDING' | 'QUALIFIED';
  /** Trạng thái HIỆN TẠI của người được mời — để Admin thấy ai đã bị dọn. */
  readonly refereeStatus: string;
  readonly refereeDeleted: boolean;
  /**
   * Bút toán đã trả cho lượt này, `null` khi chưa tính.
   *
   * Đây là `entryId` mà `POST /admin/points/ledger/:entryId/reversal` nhận.
   */
  readonly rewardEntryId: string | null;
  readonly invitedAt: Date;
}

export interface IReferralReviewCandidate {
  readonly referrerUserId: string;
  readonly username: string;
  readonly qualifiedReferrals: number;
  readonly signals: IReferralFingerprintSignals;
}

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
   * Dấu vết đăng ký trùng nhau trong danh sách người mà một người đã mời.
   *
   * Hai người được mời cùng dấu vết là tín hiệu một người tự tạo nhiều tài khoản — đúng
   * rủi ro mà [23 §23.7](../../../../../../docs/diagram/23-referral.md) nói tối.
   *
   * Chỉ ĐẾM và cho Admin xem, không tự xứ: ngưỡng bao nhiêu là đáng chặn và chặn thế
   * nào là quyết định nghiệp vụ, và một quy tắc tự động đoán sai sẽ khoá oan người dùng
   * chung một mạng gia đình hoặc một máy trong tiệm net.
   */
  readSignupFingerprintSignals(
    referrerId: string,
  ): Promise<IReferralFingerprintSignals>;

  /**
   * Danh sách người được mời cho đường ADMIN, kèm `rewardEntryId`.
   *
   * Tách khỏi danh sách của chính chủ vì hai đường cần hai thứ khác nhau. Admin cần
   * `rewardEntryId` để đi thẳng từ "tài khoản này là ảo" sang
   * `POST /admin/points/ledger/:entryId/reversal` — trước 01/10 `referrals.reward_entry_id`
   * giữ đúng con số đó mà không endpoint nào trả ra, nên đường đảo bút toán có sẵn mà
   * không ai tới được. Chính chủ thì không cần: một id bút toán nội bộ không giúp họ
   * việc gì và chỉ sinh ra câu hỏi cho CSKH.
   */
  listInviteesForReview(referrerId: string): Promise<IReferralReviewInvitee[]>;

  /**
   * Người giới thiệu đang vượt ngưỡng xem xét, nặng trước.
   *
   * Tính SỐNG từ `referrals`, không lưu thành cờ — cùng lý lẽ đã ghi ở
   * `GET /admin/reports/reporters`: con số không bao giờ lệch được với nguồn, và đổi
   * ngưỡng có hiệu lực ngay thay vì kéo theo một lượt backfill và một job đối soát.
   * Một cờ lưu sẵn cho một điều kiện TÍNH ĐƯỢC còn cũ theo hai chiều: hạ ngưỡng thì
   * cờ cũ thiếu, gỡ khoá một referee thì cờ cũ sai.
   */
  findReferrersForReview(params: {
    config: IReferralAbuseConfig;
    limit: number;
    offset: number;
  }): Promise<{ entries: IReferralReviewCandidate[]; total: number }>;
}

export const IReferralRepository = Symbol('IReferralRepository');
