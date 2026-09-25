import {
  IAppliedMaintenancePenalty,
  IEvaluateDueRankMaintenanceCommand,
  IEvaluateDueRankMaintenanceResult,
  IEvaluateDueRankMaintenanceUseCase,
} from '@/application/contracts/rank';
import {
  IPointLedgerRepository,
  IRankRepository,
} from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

/** Trần số chu kỳ trừ điểm mỗi lần chạy. */
const PenaltyBatchLimit = 500;

/** Mã phân loại bút toán trừ do trượt nhiệm vụ duy trì. */
export const MaintenanceFailedRuleCode = 'MAINTENANCE_FAILED';

@Injectable()
export class EvaluateDueRankMaintenanceUseCase implements IEvaluateDueRankMaintenanceUseCase {
  public constructor(
    @Inject(IRankRepository)
    private readonly rankRepository: IRankRepository,
    @Inject(IPointLedgerRepository)
    private readonly ledger: IPointLedgerRepository,
  ) {}

  public async handle(
    _command: IEvaluateDueRankMaintenanceCommand,
  ): Promise<IEvaluateDueRankMaintenanceResult> {
    const processedCycles =
      await this.rankRepository.evaluateDueMaintenanceCycles();

    // Quét RIÊNG chứ không dùng kết quả của bước trên: danh sách này gồm cả chu
    // kỳ trượt từ những lần chạy trước mà khoản trừ chưa kịp ghi. Chu kỳ đã
    // FAILED nên vòng đánh giá không nhìn tới nó nữa, và không vá thì khoản trừ
    // mất vĩnh viễn.
    const pending =
      await this.rankRepository.findUnpenalizedFailedCycles(PenaltyBatchLimit);

    const penalties: IAppliedMaintenancePenalty[] = [];
    for (const cycle of pending) {
      const entry = await this.ledger.appendAdjustment({
        userId: cycle.userId,
        ruleCode: MaintenanceFailedRuleCode,
        delta: -cycle.penaltyPoints,
        referenceType: 'RANK_MAINTENANCE_CYCLE',
        referenceId: cycle.cycleId,
        idempotencyKey: `${MaintenanceFailedRuleCode}:${cycle.cycleId}`,
        actor: 'SYSTEM',
        source: 'RANK_MAINTENANCE',
        reason: `Trượt nhiệm vụ duy trì bậc ${cycle.rank}`,
      });
      if (!entry.applied) continue;

      // Xét lại hạng theo balance MỚI. Khoản trừ tác động tới hạng gián tiếp
      // qua điểm, nên phải gọi tường minh ở đây — `appendAdjustment` là đường
      // ghi sổ, nó không biết gì về thứ hạng.
      const change = await this.rankRepository.reconcileNormalRank(
        cycle.userId,
      );

      penalties.push({
        cycleId: cycle.cycleId,
        userId: cycle.userId,
        rank: cycle.rank,
        points: entry.delta,
        demoted: change?.demoted === true,
      });
    }

    return { processedCycles, penalties };
  }
}
