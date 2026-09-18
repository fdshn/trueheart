import { IOnboardingTaskRepository } from '@/domain/ports/repository';
import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import { IOnboardingTaskEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, EntitySchema, IsNull, Repository } from 'typeorm';

@Injectable()
export class OnboardingTaskRepository
  extends Repository<IOnboardingTaskEntity>
  implements IOnboardingTaskRepository
{
  public constructor(
    @Inject(IOnboardingTaskEntity) target: EntitySchema,
    @InjectEntityManager() manager: EntityManager,
  ) {
    super(target, manager);
  }

  public async findActiveByEvidenceType(
    evidenceType: OnboardingTaskEvidenceTypes,
  ): Promise<IOnboardingTaskEntity | null> {
    return this.findOneBy({
      evidenceType,
      active: true,
      deletedAt: IsNull(),
    });
  }
}
