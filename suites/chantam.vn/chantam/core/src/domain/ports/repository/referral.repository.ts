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
}

export const IReferralRepository = Symbol('IReferralRepository');
