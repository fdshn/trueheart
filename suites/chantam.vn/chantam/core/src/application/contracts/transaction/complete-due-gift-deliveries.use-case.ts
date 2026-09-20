import { IUseCase } from '@chantam/service.common-lib';

/** Số ngày sau khi duyệt thì lượt trao tự coi là hoàn tất (đặc tả M3). */
export const AutoCompleteAfterDays = 5;

export interface ICompleteDueGiftDeliveriesCommand {
  /** Bỏ trống thì dùng mốc mặc định của đặc tả. */
  olderThanDays?: number;
}

export interface ICompleteDueGiftDeliveriesResult {
  completedTransactions: number;
}

export interface ICompleteDueGiftDeliveriesUseCase extends IUseCase<
  ICompleteDueGiftDeliveriesCommand,
  ICompleteDueGiftDeliveriesResult
> {}

export const ICompleteDueGiftDeliveriesUseCase = Symbol(
  'ICompleteDueGiftDeliveriesUseCase',
);
