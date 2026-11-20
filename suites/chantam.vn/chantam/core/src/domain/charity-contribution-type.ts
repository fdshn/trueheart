import { CharityContributionType } from '@chantam.vn/chantam.core-lib/models';
import { CharityContributionTypeDisabledException } from './exceptions/charity-campaign.exception';

export function assertContributionTypeAccepted(
  campaign: {
    acceptedContributionTypes: readonly CharityContributionType[];
  },
  type: CharityContributionType,
): void {
  if (!campaign.acceptedContributionTypes.includes(type))
    throw new CharityContributionTypeDisabledException(type);
}
