import { IUseCase } from '@chantam/service.common-lib';

export interface IAppendPointEntryCommand {
  userId: string;
  ruleCode: string;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  actor: string;
  source: string;
}

export interface IAppendPointEntryResult {
  entryId: number;
  balance: number;
  lifetime: number;
}

export interface IAppendPointEntryUseCase extends IUseCase<
  IAppendPointEntryCommand,
  IAppendPointEntryResult
> {}

export const IAppendPointEntryUseCase = Symbol('IAppendPointEntryUseCase');
