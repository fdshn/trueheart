import {
  IGetOwnEntitlementsCommand,
  IGetOwnEntitlementsUseCase,
} from '@/application/contracts/entitlement';
import { IEntitlementRepository } from '@/domain/ports/repository';
import { IGetOwnEntitlementsResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { Inject, Injectable } from '@nestjs/common';
import { GroupCreationEligibility } from '../group/group-creation-eligibility';

@Injectable()
export class GetOwnEntitlementsUseCase implements IGetOwnEntitlementsUseCase {
  public constructor(
    @Inject(IEntitlementRepository)
    private readonly entitlementRepository: IEntitlementRepository,
    private readonly groupCreation: GroupCreationEligibility,
  ) {}

  public async handle(
    command: IGetOwnEntitlementsCommand,
  ): Promise<IGetOwnEntitlementsResponseDto> {
    const [entitlements, groupCreation] = await Promise.all([
      this.entitlementRepository.getOwnEntitlements(command.userId),
      this.groupCreation.evaluate(command.userId),
    ]);
    return { entitlements, groupCreation };
  }
}
