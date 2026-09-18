import {
  IGetOwnPointSummaryCommand,
  IGetOwnPointSummaryUseCase,
} from '@/application/contracts/point';
import { IPointLedgerRepository } from '@/domain/ports/repository';
import { IGetOwnPointSummaryResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetOwnPointSummaryUseCase implements IGetOwnPointSummaryUseCase {
  public constructor(
    @Inject(IPointLedgerRepository)
    private readonly pointLedgerRepository: IPointLedgerRepository,
  ) {}

  public async handle(
    command: IGetOwnPointSummaryCommand,
  ): Promise<IGetOwnPointSummaryResponseDto> {
    return {
      point: await this.pointLedgerRepository.getSummary(command.userId),
    };
  }
}
