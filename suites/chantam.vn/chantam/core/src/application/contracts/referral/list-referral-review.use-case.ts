import { IReferralReviewCandidate } from '@/domain/ports/repository';
import { IUseCase } from '@chantam/service.common-lib';

export interface IListReferralReviewCommand {
  page?: number;
  pageSize?: number;
}

export interface IListReferralReviewResult {
  candidates: IReferralReviewCandidate[];
  total: number;
  /**
   * Ngưỡng đang áp, trả kèm để Admin biết danh sách này dựa trên đâu — cùng lý do
   * `GET /admin/reports/reporters` trả `minReports` và `dismissedRatioPercent`.
   *
   * `enabled: false` khi cả hai vế ngưỡng đều `0`. Khi đó danh sách rỗng, và cái
   * rỗng đó nghĩa là **chưa bật**, không phải "không có ai đáng xem" — hai câu rất
   * khác nhau mà một mảng rỗng không tự phân biệt được.
   */
  threshold: {
    enabled: boolean;
    minQualifiedReferrals: number;
    minDeviceClusters: number;
    minClusterSize: number;
  };
}

export interface IListReferralReviewUseCase extends IUseCase<
  IListReferralReviewCommand,
  IListReferralReviewResult
> {}

export const IListReferralReviewUseCase = Symbol('IListReferralReviewUseCase');
