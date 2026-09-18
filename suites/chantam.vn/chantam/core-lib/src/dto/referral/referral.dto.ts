export interface IReferralSummaryDto {
  code: string;
  totalCount: number;
  qualifiedCount: number;
  rewardedCount: number;
}

export interface IGetOwnReferralResponseDto {
  referral: IReferralSummaryDto;
}
