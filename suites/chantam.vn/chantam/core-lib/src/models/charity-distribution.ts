import { CharityContributionType } from './charity-intake';
import { CharitySupportType } from './charity-operations';

export const CharityDistributionMethods = [
  'DIRECT_RECIPIENT',
  'SHIPPING',
  'OTHER_LOCATION',
  'BANK_TRANSFER',
  'SERVICE',
] as const;
export type CharityDistributionMethod =
  (typeof CharityDistributionMethods)[number];

export const CharityServiceChannels = [
  'IN_PERSON',
  'ONLINE',
  'HOTLINE',
  'APPOINTMENT',
] as const;
export type CharityServiceChannel = (typeof CharityServiceChannels)[number];

export const CharityShippingFeePayers = ['ORGANIZER', 'RECIPIENT'] as const;
export type CharityShippingFeePayer = (typeof CharityShippingFeePayers)[number];

export const MaxCharityRoundEvidenceUrls = 20;

export interface ICharityRoundPrivateDetailsInput {
  beneficiaryBankAccountId: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientAddress: string | null;
  coordinatorName: string | null;
  coordinatorPhone: string | null;
  carrier: string | null;
  shippingFeePayer: CharityShippingFeePayer | null;
  estimatedShippingFee: number | null;
  trackingCode: string | null;
  transferContent: string | null;
}

export interface ICharityRoundDistributionInput {
  distributionMethod: CharityDistributionMethod | null;
  contributionTypes: readonly CharityContributionType[];
  locationLabel: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  serviceType: CharitySupportType | null;
  serviceChannel: CharityServiceChannel | null;
  privateDetails: ICharityRoundPrivateDetailsInput;
}

function isMissing(value: string | number | null): boolean {
  return value === null || (typeof value === 'string' && value.trim() === '');
}

function privateFieldMissing(
  input: ICharityRoundDistributionInput,
  field: keyof ICharityRoundPrivateDetailsInput,
): boolean {
  return isMissing(input.privateDetails[field]);
}

export function charityDistributionFieldGaps(
  input: ICharityRoundDistributionInput,
): string[] {
  if (input.distributionMethod === null) return [];

  const gaps: string[] = [];
  if (input.contributionTypes.length === 0) gaps.push('contributionTypes');

  const addPrivateGap = (field: keyof ICharityRoundPrivateDetailsInput) => {
    if (privateFieldMissing(input, field)) gaps.push(`privateDetails.${field}`);
  };

  switch (input.distributionMethod) {
    case 'DIRECT_RECIPIENT':
      addPrivateGap('recipientAddress');
      addPrivateGap('coordinatorName');
      addPrivateGap('coordinatorPhone');
      break;
    case 'SHIPPING':
      addPrivateGap('recipientName');
      addPrivateGap('recipientPhone');
      addPrivateGap('recipientAddress');
      addPrivateGap('carrier');
      addPrivateGap('shippingFeePayer');
      addPrivateGap('estimatedShippingFee');
      break;
    case 'OTHER_LOCATION':
      if (isMissing(input.locationLabel)) gaps.push('locationLabel');
      if (
        isMissing(input.address) &&
        (input.lat === null || input.lng === null)
      )
        gaps.push('address');
      addPrivateGap('coordinatorName');
      break;
    case 'BANK_TRANSFER':
      addPrivateGap('transferContent');
      break;
    case 'SERVICE':
      if (input.serviceType === null) gaps.push('serviceType');
      if (input.serviceChannel === null) gaps.push('serviceChannel');
      addPrivateGap('coordinatorName');
      break;
  }

  return gaps;
}

export function charityDistributionMismatch(
  input: ICharityRoundDistributionInput,
): string | null {
  return input.distributionMethod === 'BANK_TRANSFER' &&
    !input.contributionTypes.includes('MONEY')
    ? 'BANK_TRANSFER cần loại đóng góp MONEY'
    : null;
}

export function charityRoundEvidenceGaps(input: {
  readonly distributionMethod: CharityDistributionMethod | null;
  readonly evidenceUrls: readonly string[];
  readonly trackingCode: string | null;
}): string[] {
  if (input.distributionMethod === null) return [];

  const gaps: string[] = [];
  if (input.evidenceUrls.length === 0) gaps.push('evidenceUrls');
  if (input.distributionMethod === 'SHIPPING' && isMissing(input.trackingCode))
    gaps.push('trackingCode');
  return gaps;
}

const privateFieldsByMethod: Readonly<
  Record<
    CharityDistributionMethod,
    readonly (keyof ICharityRoundPrivateDetailsInput)[]
  >
> = {
  DIRECT_RECIPIENT: [
    'recipientName',
    'recipientPhone',
    'recipientAddress',
    'coordinatorName',
    'coordinatorPhone',
  ],
  SHIPPING: [
    'recipientName',
    'recipientPhone',
    'recipientAddress',
    'carrier',
    'shippingFeePayer',
    'estimatedShippingFee',
    'trackingCode',
  ],
  OTHER_LOCATION: ['coordinatorName', 'coordinatorPhone'],
  BANK_TRANSFER: ['transferContent', 'beneficiaryBankAccountId'],
  SERVICE: ['coordinatorName', 'coordinatorPhone'],
};

export function stripInapplicableDistributionFields(
  input: ICharityRoundDistributionInput,
): ICharityRoundDistributionInput {
  if (input.distributionMethod === null) return input;

  const allowedPrivateFields = privateFieldsByMethod[input.distributionMethod];
  const privateDetails = Object.fromEntries(
    Object.entries(input.privateDetails).map(([field, value]) => [
      field,
      allowedPrivateFields.includes(
        field as keyof ICharityRoundPrivateDetailsInput,
      )
        ? value
        : null,
    ]),
  ) as ICharityRoundPrivateDetailsInput;

  return {
    distributionMethod: input.distributionMethod,
    contributionTypes: input.contributionTypes,
    locationLabel:
      input.distributionMethod === 'OTHER_LOCATION'
        ? input.locationLabel
        : null,
    address:
      input.distributionMethod === 'OTHER_LOCATION' ? input.address : null,
    lat: input.distributionMethod === 'OTHER_LOCATION' ? input.lat : null,
    lng: input.distributionMethod === 'OTHER_LOCATION' ? input.lng : null,
    serviceType:
      input.distributionMethod === 'SERVICE' ? input.serviceType : null,
    serviceChannel:
      input.distributionMethod === 'SERVICE' ? input.serviceChannel : null,
    privateDetails,
  };
}
