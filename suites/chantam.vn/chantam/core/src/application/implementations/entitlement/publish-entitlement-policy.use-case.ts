import {
  IPublishEntitlementPolicyCommand,
  IPublishEntitlementPolicyUseCase,
} from '@/application/contracts/entitlement';
import { IEntitlementRepository } from '@/domain/ports/repository';
import { IPublishEntitlementPolicyResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class PublishEntitlementPolicyUseCase implements IPublishEntitlementPolicyUseCase {
  public constructor(
    @Inject(IEntitlementRepository)
    private readonly entitlementRepository: IEntitlementRepository,
  ) {}

  public async handle(
    command: IPublishEntitlementPolicyCommand,
  ): Promise<IPublishEntitlementPolicyResponseDto> {
    return {
      policy: await this.entitlementRepository.publishPolicyRevision({
        actorUserId: command.actorUserId,
        changeReason: command.changeReason,
        capabilities: command.capabilities,
      }),
    };
  }
}
