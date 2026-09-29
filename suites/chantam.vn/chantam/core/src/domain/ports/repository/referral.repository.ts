export interface IReferralSummary {
  code: string;
  totalCount: number;
  qualifiedCount: number;
  rewardedCount: number;
}

export interface IReferralQualificationResult {
  readonly qualified: boolean;
  readonly referrerId?: string;
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
