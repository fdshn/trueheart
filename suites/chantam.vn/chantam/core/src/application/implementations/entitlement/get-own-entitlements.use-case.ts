import {
  IGetOwnEntitlementsCommand,
  IGetOwnEntitlementsUseCase,
} from '@/application/contracts/entitlement';
import { IEntitlementRepository } from '@/domain/ports/repository';
import { IGetOwnEntitlementsResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetOwnEntitlementsUseCase implements IGetOwnEntitlementsUseCase {
  public constructor(
    @Inject(IEntitlementRepository)
    private readonly entitlementRepository: IEntitlementRepository,
  ) {}

  public async handle(
    command: IGetOwnEntitlementsCommand,
  ): Promise<IGetOwnEntitlementsResponseDto> {
    return {
      entitlements: await this.entitlementRepository.getOwnEntitlements(
        command.userId,
      ),
    };
  }
}
