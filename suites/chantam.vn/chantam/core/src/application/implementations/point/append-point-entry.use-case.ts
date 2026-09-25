import {
  IAppendPointEntryCommand,
  IAppendPointEntryResult,
  IAppendPointEntryUseCase,
} from '@/application/contracts/point';
import { IPointLedgerRepository } from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';
import { RankChangeNotifier } from '../rank/rank-change.notifier';

@Injectable()
export class AppendPointEntryUseCase implements IAppendPointEntryUseCase {
  public constructor(
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
    private readonly rankChange: RankChangeNotifier,
  ) {}

  public async handle(
    command: IAppendPointEntryCommand,
  ): Promise<IAppendPointEntryResult> {
    const result = await this.ledger.appendByRule(command);

    // Xét lại hạng và báo nếu cần — SAU khi sổ đã ghi. Hạng do balance quyết
    // (chốt 2026-09-24) nên mọi biến động điểm đều có thể đổi hạng, kể cả khoản
    // trừ. `afterBalanceChange` không bao giờ ném: bút toán đã vào sổ rồi.
    await this.rankChange.afterBalanceChange(command.userId);

    return result;
  }
}
