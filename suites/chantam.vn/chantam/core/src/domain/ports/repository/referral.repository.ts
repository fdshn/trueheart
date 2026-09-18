export interface IReferralSummary {
  code: string;
  totalCount: number;
  qualifiedCount: number;
  rewardedCount: number;
}

export interface IReferralRepository {
  getOwnSummary(userId: string): Promise<IReferralSummary>;
  qualifyAndAward(params: { refereeId: string }): Promise<boolean>;
}

export const IReferralRepository = Symbol('IReferralRepository');
