import { IAccuracyReconcileResult } from '@/domain/ports/repository';
import { IUseCase } from '@chantam/service.common-lib';

export interface IReconcileGiverAccuracyCommand {
  /** Chỉ báo cáo lệch, không sửa. Xem thiệt hại trước khi đụng vào dữ liệu. */
  dryRun?: boolean;
}

export type IReconcileGiverAccuracyResult = IAccuracyReconcileResult;

export interface IReconcileGiverAccuracyUseCase extends IUseCase<
  IReconcileGiverAccuracyCommand,
  IReconcileGiverAccuracyResult
> {}

export const IReconcileGiverAccuracyUseCase = Symbol(
  'IReconcileGiverAccuracyUseCase',
);
