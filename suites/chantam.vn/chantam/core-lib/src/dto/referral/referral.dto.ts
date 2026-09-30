export interface IReferralInviteeDto {
  username: string;
  fullName: string | null;
  /** `PENDING` là đăng ký rồi nhưng chưa xong onboarding. */
  status: 'PENDING' | 'QUALIFIED';
  invitedAt: Date;
  qualifiedAt: Date | null;
  /** `null` khi chưa tính, hoặc đã tính nhưng bị hoãn thưởng vì trần ngày. */
  awardedPoints: number | null;
}

export interface IReferralSummaryDto {
  code: string;
  totalCount: number;
  qualifiedCount: number;
  rewardedCount: number;
  /**
   * Người đã mời, mới nhất trước, tối đa 50.
   *
   * Ba con số ở trên nói được "bao nhiêu" nhưng không nói được "ai" — nên người mời
   * không biết ai đang kẹt ở `PENDING` để mà nhắc, trước 30/09 endpoint này chỉ có
   * ba con số đó.
   */
  invitees: IReferralInviteeDto[];
}

export interface IGetOwnReferralResponseDto {
  referral: IReferralSummaryDto;
}
