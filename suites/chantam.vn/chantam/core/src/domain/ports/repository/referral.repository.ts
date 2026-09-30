export interface IReferralSummary {
  code: string;
  totalCount: number;
  qualifiedCount: number;
  rewardedCount: number;
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
   */
  findPendingQualifications(limit: number): Promise<string[]>;
}

export const IReferralRepository = Symbol('IReferralRepository');
