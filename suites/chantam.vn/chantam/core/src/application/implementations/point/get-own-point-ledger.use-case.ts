import {
  IGetOwnPointLedgerCommand,
  IGetOwnPointLedgerUseCase,
} from '@/application/contracts/point';
import { IPointLedgerRepository } from '@/domain/ports/repository';
import { IGetOwnPointLedgerResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { PaginationMetaDto, toSkipTake } from '@chantam/service.common-lib/dto';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetOwnPointLedgerUseCase implements IGetOwnPointLedgerUseCase {
  public constructor(
    @Inject(IPointLedgerRepository)
    private readonly pointLedgerRepository: IPointLedgerRepository,
  ) {}

  public async handle(
    command: IGetOwnPointLedgerCommand,
  ): Promise<IGetOwnPointLedgerResponseDto> {
    const { skip, take } = toSkipTake(command);
    const { entries, total } = await this.pointLedgerRepository.getHistory(
      command.userId,
      { skip, take },
    );
    return {
      entries,
      meta: new PaginationMetaDto(Math.floor(skip / take) + 1, take, total),
    };
  }
}
