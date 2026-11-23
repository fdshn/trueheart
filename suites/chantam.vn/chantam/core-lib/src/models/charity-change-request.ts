import { CharityContributionType } from './charity-intake';
import { CharityPointBonusPercent } from './charity-points';
import { CharityBeneficiaryKind } from './charity-project';

/**
 * Bản sửa chờ duyệt (CR 22/11/2026 §3.17): sau khi duyệt, các trường dưới đây chỉ đổi qua một
 * bản sửa Admin duyệt — chiến dịch vẫn chạy theo bản ĐÃ DUYỆT tới lúc đó.
 */
export const CharityChangeRequestStatuses = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
] as const;
export type CharityChangeRequestStatus =
  (typeof CharityChangeRequestStatuses)[number];

export const CharityReviewedFieldKeys = [
  'title',
  'description',
  'media',
  'beneficiaries',
  'acceptedContributionTypes',
  'pointBonusPercent',
] as const;
export type CharityReviewedFieldKey = (typeof CharityReviewedFieldKeys)[number];

/** Một đơn vị nhận trong bản sửa: có `partyId` = sửa dòng cũ; không có = thêm mới. */
export interface ICharityReviewedBeneficiary {
  partyId?: string;
  name: string;
  beneficiaryKind: CharityBeneficiaryKind;
  estimatedPortions: number;
  estimatedAmount: number;
  address?: string | null;
  distributionAt?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface ICharityReviewedFields {
  title?: string;
  description?: string;
  /** Key R2 (đã xác nhận lúc gửi), gắn vào chiến dịch khi Admin duyệt. */
  media?: { keys: string[]; coverKey: string };
  beneficiaries?: ICharityReviewedBeneficiary[];
  acceptedContributionTypes?: CharityContributionType[];
  pointBonusPercent?: CharityPointBonusPercent;
}

const text = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

function normalized(
  key: CharityReviewedFieldKey,
  fields: ICharityReviewedFields,
): string {
  switch (key) {
    case 'title':
    case 'description':
      return JSON.stringify(text(fields[key]));
    case 'media':
      return JSON.stringify(
        fields.media
          ? { keys: fields.media.keys, coverKey: fields.media.coverKey }
          : null,
      );
    case 'beneficiaries':
      return JSON.stringify(
        (fields.beneficiaries ?? [])
          .map((unit) => ({
            partyId: unit.partyId ?? null,
            name: text(unit.name),
            beneficiaryKind: unit.beneficiaryKind,
            estimatedPortions: unit.estimatedPortions,
            estimatedAmount: unit.estimatedAmount,
            address: text(unit.address),
            distributionAt: unit.distributionAt
              ? new Date(unit.distributionAt).toISOString()
              : null,
            lat: unit.lat ?? null,
            lng: unit.lng ?? null,
          }))
          .sort((left, right) =>
            `${left.partyId ?? ''}|${left.name ?? ''}`.localeCompare(
              `${right.partyId ?? ''}|${right.name ?? ''}`,
            ),
          ),
      );
    case 'acceptedContributionTypes':
      return JSON.stringify(
        [...(fields.acceptedContributionTypes ?? [])].sort(),
      );
    case 'pointBonusPercent':
      return JSON.stringify(fields.pointBonusPercent ?? null);
  }
}

/** Các khoá CÓ trong `proposed` mà giá trị (đã chuẩn hoá) khác `base`, theo thứ tự chuẩn. */
export function reviewedFieldsChanged(
  base: ICharityReviewedFields,
  proposed: ICharityReviewedFields,
): CharityReviewedFieldKey[] {
  return CharityReviewedFieldKeys.filter(
    (key) =>
      proposed[key] !== undefined &&
      normalized(key, base) !== normalized(key, proposed),
  );
}
