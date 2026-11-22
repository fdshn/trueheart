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

export const MaxCharityDistributionEvidenceUrls = 20;

export interface ICharityDistributionPrivateDetailsInput {
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

export interface ICharityDistributionInput {
  distributionMethod: CharityDistributionMethod | null;
  contributionTypes: readonly CharityContributionType[];
  locationLabel: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  serviceType: CharitySupportType | null;
  serviceChannel: CharityServiceChannel | null;
  privateDetails: ICharityDistributionPrivateDetailsInput;
}

function isMissing(value: string | number | null): boolean {
  return value === null || (typeof value === 'string' && value.trim() === '');
}

function privateFieldMissing(
  input: ICharityDistributionInput,
  field: keyof ICharityDistributionPrivateDetailsInput,
): boolean {
  return isMissing(input.privateDetails[field]);
}

export function charityDistributionFieldGaps(
  input: ICharityDistributionInput,
): string[] {
  if (input.distributionMethod === null) return [];

  const gaps: string[] = [];
  if (input.contributionTypes.length === 0) gaps.push('contributionTypes');

  const addPrivateGap = (
    field: keyof ICharityDistributionPrivateDetailsInput,
  ) => {
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
      // Cấp chiến dịch (CR 22/11/2026): điểm trao là địa chỉ của đơn vị nhận / điểm tiếp
      // nhận nên không còn bắt buộc nhãn hay địa chỉ riêng.
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
  input: ICharityDistributionInput,
): string | null {
  return input.distributionMethod === 'BANK_TRANSFER' &&
    !input.contributionTypes.includes('MONEY')
    ? 'BANK_TRANSFER cần loại đóng góp MONEY'
    : null;
}

export function charityDistributionEvidenceGaps(input: {
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

/**
 * Bước trao của chiến dịch đã hoàn tất chưa: đủ bằng chứng đúng hình thức, và với
 * `BANK_TRANSFER` thì tài khoản thụ hưởng còn hiệu lực, cùng chiến dịch, đã xác thực.
 * Chiến dịch cũ không có hình thức luôn coi là xong.
 */
export function charityDistributionSettled(input: {
  readonly distributionMethod: CharityDistributionMethod | null;
  readonly evidenceUrls: readonly string[];
  readonly trackingCode: string | null;
  readonly beneficiaryAccount: {
    readonly verified: boolean;
    readonly live: boolean;
    readonly sameCampaign: boolean;
  } | null;
}): { settled: boolean; evidenceGaps: string[]; accountVerified: boolean } {
  const evidenceGaps = charityDistributionEvidenceGaps(input);
  const account = input.beneficiaryAccount;
  const accountVerified =
    input.distributionMethod !== 'BANK_TRANSFER' ||
    (account !== null &&
      account.verified &&
      account.live &&
      account.sameCampaign);
  return {
    settled: evidenceGaps.length === 0 && accountVerified,
    evidenceGaps,
    accountVerified,
  };
}

const privateFieldsByMethod: Readonly<
  Record<
    CharityDistributionMethod,
    readonly (keyof ICharityDistributionPrivateDetailsInput)[]
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
  input: ICharityDistributionInput,
): ICharityDistributionInput {
  if (input.distributionMethod === null) return input;

  const allowedPrivateFields = privateFieldsByMethod[input.distributionMethod];
  const privateDetails = Object.fromEntries(
    Object.entries(input.privateDetails).map(([field, value]) => [
      field,
      allowedPrivateFields.includes(
        field as keyof ICharityDistributionPrivateDetailsInput,
      )
        ? value
        : null,
    ]),
  ) as ICharityDistributionPrivateDetailsInput;

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
