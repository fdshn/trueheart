import {
  CharityDistributionFieldRequiredException,
  CharityDistributionMethodMismatchException,
} from '@/domain/exceptions';
import { ICharityCampaignDistributionInput } from '@/domain/ports/repository';
import {
  charityDistributionFieldGaps,
  charityDistributionMismatch,
  normalizeContributionTypes,
  stripInapplicableDistributionFields,
} from '@chantam.vn/chantam.core-lib/models';

const trimmed = (value: string | null | undefined): string | null =>
  value?.trim() || null;

/**
 * Luật hình thức trao DUY NHẤT của chiến dịch (CR 22/11/2026 — đã bỏ đợt trao), dùng chung cho
 * tạo chiến dịch và `PUT :id/distribution`. Thứ tự: trim → bỏ trường không thuộc hình thức →
 * sai cặp hình thức/loại (400 0x13_58) → thiếu trường (400 0x13_57).
 */
export function prepareCharityCampaignDistribution(
  input: ICharityCampaignDistributionInput,
): ICharityCampaignDistributionInput {
  const privateDetails = Object.fromEntries(
    Object.entries(input.privateDetails).map(([key, value]) => [
      key,
      typeof value === 'string' ? trimmed(value) : value,
    ]),
  ) as ICharityCampaignDistributionInput['privateDetails'];
  const stripped = stripInapplicableDistributionFields({
    distributionMethod: input.distributionMethod,
    contributionTypes: normalizeContributionTypes(input.contributionTypes),
    locationLabel: null,
    address: null,
    lat: null,
    lng: null,
    serviceType: input.serviceType,
    serviceChannel: input.serviceChannel,
    privateDetails,
  });
  const mismatch = charityDistributionMismatch(stripped);
  if (mismatch) throw new CharityDistributionMethodMismatchException(mismatch);
  const gaps = charityDistributionFieldGaps(stripped);
  if (gaps.length > 0)
    throw new CharityDistributionFieldRequiredException(gaps.join(', '));
  return {
    distributionMethod: stripped.distributionMethod,
    contributionTypes: stripped.contributionTypes,
    serviceType: stripped.serviceType,
    serviceChannel: stripped.serviceChannel,
    privateDetails: {
      ...stripped.privateDetails,
      beneficiaryBankAccountId:
        stripped.privateDetails.beneficiaryBankAccountId ?? null,
    },
  };
}
