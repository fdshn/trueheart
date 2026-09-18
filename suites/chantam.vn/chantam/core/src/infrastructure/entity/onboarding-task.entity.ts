import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import { IOnboardingTaskEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  PostgresAuditableEntity,
  PostgresBaseEntity,
  PostgresDistributedEntity,
  PostgresSoftDeletableEntity,
} from '@chantam/service.persistency-lib';
import { Mixin } from 'ts-mixer';
import { Column, Entity, Index } from 'typeorm';

@Entity('onboarding_tasks')
export class OnboardingTaskEntity
  extends Mixin(
    PostgresBaseEntity,
    PostgresDistributedEntity,
    PostgresAuditableEntity,
    PostgresSoftDeletableEntity,
  )
  implements IOnboardingTaskEntity
{
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100, nullable: false })
  key: OnboardingTaskEvidenceTypes;

  @Column({
    name: 'evidence_type',
    type: 'varchar',
    length: 100,
    nullable: false,
  })
  evidenceType: OnboardingTaskEvidenceTypes;

  @Column({ type: 'varchar', length: 200, nullable: false })
  title: string;

  @Column({ type: 'text', nullable: false })
  description: string;

  @Column({ type: 'boolean', default: true, nullable: false })
  required: boolean;

  @Index()
  @Column({ type: 'boolean', default: true, nullable: false })
  active: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0, nullable: false })
  sortOrder: number;
}
