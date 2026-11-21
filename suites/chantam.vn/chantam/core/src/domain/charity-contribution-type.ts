import {
  CharityContributionType,
  CharityDistributionMethod,
} from '@chantam.vn/chantam.core-lib/models';
import {
  CharityContributionTypeDisabledException,
  CharityDistributionMethodMismatchException,
} from './exceptions/charity-campaign.exception';

export function assertContributionTypeAccepted(
  campaign: {
    acceptedContributionTypes: readonly CharityContributionType[];
  },
  type: CharityContributionType,
): void {
  if (!campaign.acceptedContributionTypes.includes(type))
    throw new CharityContributionTypeDisabledException(type);
}

/** Đợt chuyển khoản chỉ hợp lệ khi chính dự án đang nhận tiền (MONEY). */
export function assertDistributionMethodAcceptedByCampaign(
  campaign: {
    acceptedContributionTypes: readonly CharityContributionType[];
  },
  distributionMethod: CharityDistributionMethod | null,
): void {
  if (
    distributionMethod === 'BANK_TRANSFER' &&
    !campaign.acceptedContributionTypes.includes('MONEY')
  )
    throw new CharityDistributionMethodMismatchException(
      'BANK_TRANSFER cần dự án đang nhận MONEY',
    );
}
