import {
  IAppendPointEntryCommand,
  IAppendPointEntryResult,
} from '@/application/contracts/point';

export interface IPointLedgerRepository {
  appendByRule(
    command: IAppendPointEntryCommand,
  ): Promise<IAppendPointEntryResult>;
}

export const IPointLedgerRepository = Symbol('IPointLedgerRepository');
