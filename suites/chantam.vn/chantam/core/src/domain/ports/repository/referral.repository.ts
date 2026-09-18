export interface IReferralRepository {
  qualifyAndAward(params: { refereeId: string }): Promise<boolean>;
}

export const IReferralRepository = Symbol('IReferralRepository');
