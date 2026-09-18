import {
  IPromoteOnboardingMemberCommand,
  IPromoteOnboardingMemberUseCase,
} from '@/application/contracts/rank';
import { IRankRepository } from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class PromoteOnboardingMemberUseCase implements IPromoteOnboardingMemberUseCase {
  public constructor(
    @Inject(IRankRepository) private readonly ranks: IRankRepository,
  ) {}

  public async handle(
    command: IPromoteOnboardingMemberCommand,
  ): Promise<boolean> {
    return this.ranks.promoteMemberOnboarding(command.userId);
  }
}
