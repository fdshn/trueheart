import { IUseCase } from '@chantam/service.common-lib/use-case';

export interface ISettleGiftRewardsCommand {
  readonly dryRun?: boolean;
  /** Trần số lượt xử lý mỗi lần chạy. Mặc định 500. */
  readonly limit?: number;
}

export interface ISettledGiftReward {
  readonly transactionId: string;
  readonly giverId: string;
  readonly points: number;
  readonly appliedPercent: number;
}

export interface ISettledReceiverReward {
  readonly transactionId: string;
  readonly receiverId: string;
  readonly points: number;
}

export interface ISettleGiftRewardsResult {
  /** Số lượt trao mà NGƯỜI TẶNG còn chưa được trả thưởng. */
  readonly pending: number;
  /** Số lượt trao mà NGƯỜI NHẬN còn chưa được trả thưởng. */
  readonly pendingReceivers: number;
  /** Số ngày chờ đang cấu hình. */
  readonly graceDays: number;
  /** Mức phần trăm mặc định đang cấu hình. */
  readonly defaultPercent: number;
  readonly settled: ISettledGiftReward[];
  readonly settledReceivers: ISettledReceiverReward[];
}

export interface ISettleGiftRewardsUseCase extends IUseCase<
  ISettleGiftRewardsCommand,
  ISettleGiftRewardsResult
> {}

export const ISettleGiftRewardsUseCase = Symbol('ISettleGiftRewardsUseCase');
