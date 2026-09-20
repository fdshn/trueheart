import {
  IAppendPointEntryCommand,
  IAppendPointEntryResult,
} from '@/application/contracts/point';
import { EntityManager } from 'typeorm';

export interface IPointLedgerSummary {
  balance: number;
  lifetime: number;
}

export interface IPointLedgerEntry {
  entryId: number;
  ruleCode: string;
  ruleVersion: number;
  delta: number;
  balanceAfter: number;
  lifetimeAfter: number;
  source: string;
  reason: string | null;
  createdAt: Date;
}

export interface IPointLedgerPage {
  entries: IPointLedgerEntry[];
  total: number;
}

export interface IPointLedgerHistoryQuery {
  skip: number;
  take: number;
}

export interface IPointLedgerRepository {
  appendByRule(
    command: IAppendPointEntryCommand,
  ): Promise<IAppendPointEntryResult>;
  appendByRuleWithinTransaction(
    manager: EntityManager,
    command: IAppendPointEntryCommand,
  ): Promise<IAppendPointEntryResult>;
  getSummary(userId: string): Promise<IPointLedgerSummary>;
  getHistory(
    userId: string,
    query: IPointLedgerHistoryQuery,
  ): Promise<IPointLedgerPage>;
  /**
   * Những người đã xác minh SĐT nhưng chưa có bút toán thưởng.
   *
   * Xác minh SĐT và ghi thưởng là hai bước riêng, nên tiến trình chết giữa
   * chừng là mất thưởng vĩnh viễn — người dùng không có cách nào xác minh lại
   * để được thưởng. Đây là đầu vào cho job đối soát chạy từ scheduler ngoài.
   */
  findPhoneVerifiedUsersMissingReward(limit: number): Promise<string[]>;
}

export const IPointLedgerRepository = Symbol('IPointLedgerRepository');
