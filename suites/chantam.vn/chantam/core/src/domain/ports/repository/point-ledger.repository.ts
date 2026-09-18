import {
  IAppendPointEntryCommand,
  IAppendPointEntryResult,
} from '@/application/contracts/point';

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
  getSummary(userId: string): Promise<IPointLedgerSummary>;
  getHistory(
    userId: string,
    query: IPointLedgerHistoryQuery,
  ): Promise<IPointLedgerPage>;
}

export const IPointLedgerRepository = Symbol('IPointLedgerRepository');
