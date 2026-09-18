import {
  IEvaluateDueRankMaintenanceCommand,
  IEvaluateDueRankMaintenanceResult,
  IEvaluateDueRankMaintenanceUseCase,
} from '@/application/contracts/rank';
import { IRankRepository } from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class EvaluateDueRankMaintenanceUseCase implements IEvaluateDueRankMaintenanceUseCase {
  public constructor(
    @Inject(IRankRepository)
    private readonly rankRepository: IRankRepository,
  ) {}

  public async handle(
    _command: IEvaluateDueRankMaintenanceCommand,
  ): Promise<IEvaluateDueRankMaintenanceResult> {
    const processedCycles =
      await this.rankRepository.evaluateDueMaintenanceCycles();
    return { processedCycles };
  }
}
