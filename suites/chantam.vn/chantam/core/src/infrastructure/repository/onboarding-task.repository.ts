import { IOnboardingTaskRepository } from '@/domain/ports/repository';
import { OnboardingTaskEvidenceTypes } from '@chantam.vn/chantam.core-lib/consts';
import { IOnboardingTaskProgressDto } from '@chantam.vn/chantam.core-lib/dto';
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

  public async findUserTaskProgress(
    userId: string,
  ): Promise<IOnboardingTaskProgressDto[]> {
    const rows = await this.manager.query<
      Array<{
        id: string;
        key: string;
        evidenceType: string;
        title: string;
        description: string;
        required: boolean;
        sortOrder: number;
        completed: boolean;
        completedAt: Date | string | null;
      }>
    >(
      `
        SELECT
          task.global_id AS id,
          task.key AS key,
          task.evidence_type AS "evidenceType",
          task.title AS title,
          task.description AS description,
          task.required AS required,
          task.sort_order AS "sortOrder",
          (completion.task_id IS NOT NULL) AS completed,
          completion.completed_at AS "completedAt"
        FROM onboarding_tasks task
        LEFT JOIN user_onboarding_task_completions completion
          ON completion.task_id = task.global_id
          AND completion.user_id = $1
        WHERE task.active = true
          AND task.deleted_at IS NULL
        ORDER BY task.sort_order ASC, task.created_at ASC
      `,
      [userId],
    );

    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      evidenceType: r.evidenceType,
      title: r.title,
      description: r.description,
      required: Boolean(r.required),
      sortOrder: Number(r.sortOrder),
      completed: Boolean(r.completed),
      completedAt: r.completedAt,
    }));
  }
}
