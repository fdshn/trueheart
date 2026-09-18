import {
  IAppendPointEntryCommand,
  IAppendPointEntryResult,
  IAppendPointEntryUseCase,
} from '@/application/contracts/point';
import { IPointLedgerRepository } from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class AppendPointEntryUseCase implements IAppendPointEntryUseCase {
  public constructor(
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
  ) {}

  public async handle(
    command: IAppendPointEntryCommand,
  ): Promise<IAppendPointEntryResult> {
    return this.ledger.appendByRule(command);
  }
}
