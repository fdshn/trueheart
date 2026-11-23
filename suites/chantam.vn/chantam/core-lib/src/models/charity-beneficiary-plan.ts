import { CharityBeneficiaryKind } from './charity-project';

/**
 * Đơn vị nhận của chiến dịch (CR 22/11/2026 §3.17d): mỗi đơn vị có số suất, tiền ước tính,
 * địa chỉ và giờ trao. Tổng số suất đặt SÀN cho số lượng mục tiêu của từng nhu cầu hiện vật;
 * tổng tiền ước tính đặt sàn cho mục tiêu tiền.
 */
export interface ICharityBeneficiaryPlan {
  name: string;
  beneficiaryKind: CharityBeneficiaryKind;
  estimatedPortions: number;
  estimatedAmount: number;
  address: string | null;
  distributionAt: Date | null;
}

export function totalEstimatedPortions(
  list: readonly Pick<ICharityBeneficiaryPlan, 'estimatedPortions'>[],
): number {
  return list.reduce((sum, item) => sum + item.estimatedPortions, 0);
}

export function totalEstimatedAmount(
  list: readonly Pick<ICharityBeneficiaryPlan, 'estimatedAmount'>[],
): number {
  return list.reduce((sum, item) => sum + item.estimatedAmount, 0);
}

/** Số lượng tối thiểu của một nhu cầu = tổng suất × số lượng mỗi suất; 0 khi chưa có suất. */
export function minimumQuantityFor(
  totalPortions: number,
  quantityPerPortion: number,
): number {
  if (totalPortions <= 0) return 0;
  return totalPortions * quantityPerPortion;
}

export interface ICharityNeedPortionShortfall {
  index: number;
  needItemId: string | null;
  itemName: string;
  targetQuantity: number;
  minimumQuantity: number;
}

/** Nhu cầu có mục tiêu thấp hơn sàn số suất (`CHARITY_NEED_BELOW_ESTIMATED_PORTIONS`). */
export function needPortionShortfalls(
  needs: readonly {
    index: number;
    needItemId: string | null;
    itemName: string;
    targetQuantity: number;
    quantityPerPortion: number;
  }[],
  totalPortions: number,
): ICharityNeedPortionShortfall[] {
  if (totalPortions <= 0) return [];
  return needs
    .map((need) => ({
      index: need.index,
      needItemId: need.needItemId,
      itemName: need.itemName,
      targetQuantity: need.targetQuantity,
      minimumQuantity: minimumQuantityFor(
        totalPortions,
        need.quantityPerPortion,
      ),
    }))
    .filter((row) => row.targetQuantity < row.minimumQuantity);
}

/** Mục tiêu tiền thấp hơn tổng tiền ước tính của các đơn vị nhận. */
export function fundingBelowEstimate(
  totalTargetAmount: number,
  totalEstimatedAmount: number,
): boolean {
  return totalTargetAmount < totalEstimatedAmount;
}

/** Đơn vị có giờ trao nằm ngoài khung trao; giờ trao chưa hẹn không tính là "ngoài". */
export function beneficiariesOutsideWindow(
  list: readonly Pick<ICharityBeneficiaryPlan, 'name' | 'distributionAt'>[],
  window: { startsAt: Date; endsAt: Date } | null,
): { index: number; name: string; distributionAt: Date }[] {
  if (!window) return [];
  const result: { index: number; name: string; distributionAt: Date }[] = [];
  list.forEach((item, index) => {
    const at = item.distributionAt;
    if (!at) return;
    if (
      at.getTime() < window.startsAt.getTime() ||
      at.getTime() > window.endsAt.getTime()
    )
      result.push({ index, name: item.name, distributionAt: at });
  });
  return result;
}

/** Gửi duyệt: mỗi đơn vị nhận cần địa chỉ và giờ trao. */
export function beneficiarySubmitGaps(
  list: readonly Pick<ICharityBeneficiaryPlan, 'address' | 'distributionAt'>[],
): string[] {
  const gaps: string[] = [];
  list.forEach((item, index) => {
    if (!item.address?.trim()) gaps.push(`beneficiaries[${index}].address`);
    if (!item.distributionAt)
      gaps.push(`beneficiaries[${index}].distributionAt`);
  });
  return gaps;
}

/** Dữ liệu tối thiểu để dựng bản công khai — có thể mang thêm trường riêng tư (bị bỏ). */
export interface ICharityBeneficiaryPartyLike {
  readonly name: string;
  readonly beneficiaryKind: CharityBeneficiaryKind;
  readonly estimatedPortions: number;
  readonly estimatedAmount: number;
  readonly distributionAt: Date | null;
  readonly address: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

export interface ICharityPublicBeneficiary {
  name: string;
  beneficiaryKind: CharityBeneficiaryKind;
  estimatedPortions: number;
  estimatedAmount: number;
  distributionAt: Date | null;
  address: string | null;
  location: { lat: number; lng: number } | null;
}

/**
 * Bản công khai: chọn TƯỜNG MINH từng trường — không bao giờ có số điện thoại hay người phụ
 * trách. Cá nhân (`INDIVIDUAL`) không lộ địa chỉ và toạ độ.
 */
export function toPublicBeneficiary(
  party: ICharityBeneficiaryPartyLike,
): ICharityPublicBeneficiary {
  const isGroup = party.beneficiaryKind === 'GROUP';
  return {
    name: party.name,
    beneficiaryKind: party.beneficiaryKind,
    estimatedPortions: party.estimatedPortions,
    estimatedAmount: party.estimatedAmount,
    distributionAt: party.distributionAt,
    address: isGroup ? party.address : null,
    location:
      isGroup && party.lat !== null && party.lng !== null
        ? { lat: party.lat, lng: party.lng }
        : null,
  };
}
