import {
  CharityFundingBelowEstimatedAmountException,
  CharityNeedBelowEstimatedPortionsException,
} from '@/domain/exceptions';
import {
  fundingBelowEstimate,
  ICharityBeneficiaryPlan,
  needPortionShortfalls,
  totalEstimatedAmount,
  totalEstimatedPortions,
} from '@chantam.vn/chantam.core-lib/models';

/**
 * Sàn theo kế hoạch trao (CR 22/11/2026 §3.17d), kiểm CẢ HAI chiều — sửa nhu cầu xuống dưới
 * sàn, hoặc tăng suất/tiền của đơn vị nhận lên trên mục tiêu, đều bị chặn:
 * 1. mỗi nhu cầu hiện vật đang mở: `targetQuantity ≥ tổng suất × quantityPerPortion` (0x13_5d);
 * 2. tổng mục tiêu tiền ≥ tổng tiền ước tính (0x13_5e).
 */
export function assertPortionFloors(input: {
  needs: readonly {
    index: number;
    needItemId: string | null;
    itemName: string;
    targetQuantity: number;
    quantityPerPortion: number;
  }[];
  fundingTargets: readonly number[];
  beneficiaries: readonly Pick<
    ICharityBeneficiaryPlan,
    'estimatedPortions' | 'estimatedAmount'
  >[];
}): void {
  const shortfalls = needPortionShortfalls(
    input.needs,
    totalEstimatedPortions(input.beneficiaries),
  );
  if (shortfalls.length > 0)
    throw new CharityNeedBelowEstimatedPortionsException(shortfalls);
  const estimated = totalEstimatedAmount(input.beneficiaries);
  const target = input.fundingTargets.reduce((sum, value) => sum + value, 0);
  if (estimated > 0 && fundingBelowEstimate(target, estimated))
    throw new CharityFundingBelowEstimatedAmountException(target, estimated);
}
