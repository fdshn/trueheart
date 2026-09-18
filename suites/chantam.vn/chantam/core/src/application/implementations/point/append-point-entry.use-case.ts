import {
  IAppendPointEntryCommand,
  IAppendPointEntryResult,
  IAppendPointEntryUseCase,
} from '@/application/contracts/point';
import {
  IPointLedgerRepository,
  IRankRepository,
} from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class AppendPointEntryUseCase implements IAppendPointEntryUseCase {
  public constructor(
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
    @Inject(IRankRepository)
    private readonly rankRepository: IRankRepository,
  ) {}

  public async handle(
    command: IAppendPointEntryCommand,
  ): Promise<IAppendPointEntryResult> {
    const result = await this.ledger.appendByRule(command);
    await this.rankRepository.reconcileNormalRank(command.userId);
    return result;
  }
}
