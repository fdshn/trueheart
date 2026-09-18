import {
  IRecordOnboardingEvidenceParams,
  IRecordOnboardingEvidenceResult,
  IUserOnboardingTaskCompletionRepository,
} from '@/domain/ports/repository';
import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { IUserOnboardingTaskCompletionEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, EntitySchema, Repository } from 'typeorm';

@Injectable()
export class UserOnboardingTaskCompletionRepository
  extends Repository<IUserOnboardingTaskCompletionEntity>
  implements IUserOnboardingTaskCompletionRepository
{
  public constructor(
    @Inject(IUserOnboardingTaskCompletionEntity) target: EntitySchema,
    @InjectEntityManager() manager: EntityManager,
  ) {
    super(target, manager);
  }

  public async recordEvidenceAndPromoteMember(
    params: IRecordOnboardingEvidenceParams,
  ): Promise<IRecordOnboardingEvidenceResult> {
    return this.manager.transaction(async (manager) => {
      const tasks: Array<{ global_id: string }> = await manager.query(
        `
          SELECT global_id
          FROM onboarding_tasks
          WHERE evidence_type = $1
            AND active = true
            AND deleted_at IS NULL
        `,
        [params.evidenceType],
      );

      for (const task of tasks) {
        await manager.query(
          `
            INSERT INTO user_onboarding_task_completions
              (user_id, task_id, completed_at, evidence_ref)
            VALUES ($1, $2, now(), $3)
            ON CONFLICT (user_id, task_id) DO NOTHING
          `,
          [params.userId, task.global_id, params.evidenceRef ?? null],
        );
      }

      const [
        { required_count: requiredCount, completed_count: completedCount },
      ]: [{ required_count: string; completed_count: string }] =
        await manager.query(
          `
          SELECT
            COUNT(task.global_id)::text AS required_count,
            COUNT(completion.task_id)::text AS completed_count
          FROM onboarding_tasks task
          LEFT JOIN user_onboarding_task_completions completion
            ON completion.task_id = task.global_id
            AND completion.user_id = $1
          WHERE task.required = true
            AND task.active = true
            AND task.deleted_at IS NULL
        `,
          [params.userId],
        );

      if (Number(requiredCount) !== Number(completedCount))
        return { promoted: false };

      const promoted = await manager.query<{ global_id: string }[]>(
        `
          UPDATE users
          SET rank = $2
          WHERE global_id = $1
            AND rank = $3
          RETURNING global_id
        `,
        [params.userId, UserRanks.MEMBER, UserRanks.VIEWER],
      );

      return { promoted: promoted.length === 1 };
    });
  }
}
