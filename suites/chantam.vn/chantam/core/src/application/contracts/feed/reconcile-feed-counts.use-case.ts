import { IUseCase } from '@chantam/service.common-lib';

export interface IReconcileFeedCountsCommand {
  /**
   * Chỉ báo cáo lệch, không sửa. Dùng để xem thiệt hại trước khi đụng vào dữ
   * liệu — chạy mù rồi mới nhìn là cách hay nhất để che mất một lỗi thật.
   */
  dryRun?: boolean;
}

export interface IFeedCountDrift {
  readonly subject: 'POST' | 'COMMENT';
  readonly subjectId: string;
  readonly column: string;
  readonly stored: number;
  readonly actual: number;
}

export interface IReconcileFeedCountsResult {
  /** Số chủ thể đã quét. */
  readonly scanned: number;
  /** Những chỗ lệch tìm thấy, kể cả khi `dryRun`. */
  readonly drifts: IFeedCountDrift[];
  /** Số dòng đã sửa. Luôn `0` khi `dryRun`. */
  readonly repaired: number;
}

export interface IReconcileFeedCountsUseCase extends IUseCase<
  IReconcileFeedCountsCommand,
  IReconcileFeedCountsResult
> {}

export const IReconcileFeedCountsUseCase = Symbol(
  'IReconcileFeedCountsUseCase',
);
