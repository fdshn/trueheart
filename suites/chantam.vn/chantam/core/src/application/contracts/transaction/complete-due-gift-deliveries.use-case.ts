import { IUseCase } from '@chantam/service.common-lib';

/** Số ngày sau khi duyệt thì lượt trao tự coi là hoàn tất (đặc tả M3). */
export const AutoCompleteAfterDays = 5;

export interface ICompleteDueGiftDeliveriesCommand {
  /** Bỏ trống thì dùng mốc mặc định của đặc tả. */
  olderThanDays?: number;
}

export interface ICompleteDueGiftDeliveriesResult {
  completedTransactions: number;
  /**
   * Số lượt quá hạn nhưng bị GIỮ LẠI vì đang có báo xấu chưa xử.
   *
   * Tự khỏi ở lần chạy sau khi Admin đóng báo xấu, nên không cần hàng đợi riêng.
   * Nhưng phải lộ ra: một lượt trao treo vô thời hạn vì báo xấu không ai xử là
   * chuyện người vận hành cần thấy.
   */
  heldForDispute: number;
}

export interface ICompleteDueGiftDeliveriesUseCase extends IUseCase<
  ICompleteDueGiftDeliveriesCommand,
  ICompleteDueGiftDeliveriesResult
> {}

export const ICompleteDueGiftDeliveriesUseCase = Symbol(
  'ICompleteDueGiftDeliveriesUseCase',
);
