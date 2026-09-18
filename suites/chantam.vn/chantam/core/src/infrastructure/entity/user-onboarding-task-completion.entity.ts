import { IUserOnboardingTaskCompletionEntity } from '@chantam.vn/chantam.core-lib/entities';
import { PostgresBaseEntity } from '@chantam/service.persistency-lib';
import { Column, Entity, Index } from 'typeorm';

@Entity('user_onboarding_task_completions')
@Index(['userId', 'taskId'], { unique: true })
export class UserOnboardingTaskCompletionEntity
  extends PostgresBaseEntity
  implements IUserOnboardingTaskCompletionEntity
{
  @Index()
  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  @Index()
  @Column({ name: 'task_id', type: 'uuid', nullable: false })
  taskId: string;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: false })
  completedAt: Date;

  @Column({ name: 'evidence_ref', type: 'varchar', length: 500, nullable: true })
  evidenceRef: string | null;
}
