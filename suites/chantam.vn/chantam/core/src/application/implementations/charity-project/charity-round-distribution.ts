import {
  CharityDistributionFieldRequiredException,
  CharityDistributionMethodMismatchException,
} from '@/domain/exceptions';
import { ICharityRoundInput } from '@/domain/ports/repository';
import {
  charityDistributionFieldGaps,
  charityDistributionMismatch,
  MaxCharityRoundEvidenceUrls,
  normalizeContributionTypes,
  stripInapplicableDistributionFields,
} from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';

const trimmed = (value: string | null | undefined): string | null =>
  value?.trim() || null;
const isHttpsUrl = (value: string): boolean => /^https:\/\/\S+$/.test(value);

export function prepareCharityRoundDistribution(
  input: ICharityRoundInput,
): ICharityRoundInput {
  const privateDetails = Object.fromEntries(
    Object.entries(input.privateDetails).map(([key, value]) => [
      key,
      typeof value === 'string' ? trimmed(value) : value,
    ]),
  ) as ICharityRoundInput['privateDetails'];
  const distribution = stripInapplicableDistributionFields({
    distributionMethod: input.distributionMethod,
    contributionTypes: normalizeContributionTypes(input.contributionTypes),
    locationLabel: trimmed(input.locationLabel),
    address: trimmed(input.address),
    lat: input.lat,
    lng: input.lng,
    serviceType: input.serviceType,
    serviceChannel: input.serviceChannel,
    privateDetails,
  });
  if (
    (distribution.distributionMethod === 'DIRECT_RECIPIENT' ||
      distribution.distributionMethod === 'SHIPPING') &&
    distribution.privateDetails.recipientAddress === null
  )
    distribution.privateDetails.recipientAddress = trimmed(input.address);
  const evidenceUrls = [...input.evidenceUrls];
  if (
    evidenceUrls.length > MaxCharityRoundEvidenceUrls ||
    evidenceUrls.some((url) => !isHttpsUrl(url)) ||
    new Set(evidenceUrls).size !== evidenceUrls.length
  )
    throw new ValidationFailedException([
      'round.evidenceUrls: https://, không trùng, tối đa 20',
    ]);
  const mismatch = charityDistributionMismatch(distribution);
  if (mismatch) throw new CharityDistributionMethodMismatchException(mismatch);
  const gaps = charityDistributionFieldGaps(distribution);
  if (gaps.length > 0)
    throw new CharityDistributionFieldRequiredException(gaps.join(', '));
  const round = {
    ...input,
    ...distribution,
    evidenceUrls,
    needsReview: false,
    title: input.title.trim(),
  };
  const errors: string[] = [];
  if (!round.title) errors.push('round.title: bắt buộc');
  if (round.endsAt <= round.startsAt)
    errors.push('round.endsAt: phải sau startsAt');
  if (errors.length > 0) throw new ValidationFailedException(errors);
  return round;
}
