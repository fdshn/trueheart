import {
  IAppendPointEntryCommand,
  IAppendPointEntryResult,
} from '@/application/contracts/point';
import { IPointLedgerRepository } from '@/domain/ports/repository';
import { PointRuleUnavailableException } from '@/domain/exceptions';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

@Injectable()
export class PointLedgerRepository implements IPointLedgerRepository {
  public constructor(@InjectEntityManager() private readonly manager: EntityManager) {}

  public async appendByRule(
    command: IAppendPointEntryCommand,
  ): Promise<IAppendPointEntryResult> {
    return this.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        command.userId,
      ]);

      const [rule] = await manager.query<
        {
          points: number;
          affects_lifetime: boolean;
          version: number;
          daily_cap: number | null;
        }[]
      >(
        `
          SELECT points, affects_lifetime, version, daily_cap
          FROM point_rules
          WHERE code = $1 AND is_enabled = true
          ORDER BY version DESC
          LIMIT 1
        `,
        [command.ruleCode],
      );
      if (!rule) throw new PointRuleUnavailableException(command.ruleCode);

      const existing = await manager.query<
        { id: string; balance_after: number; lifetime_after: number }[]
      >(
        `
          SELECT id, balance_after, lifetime_after
          FROM point_ledger
          WHERE idempotency_key = $1
        `,
        [command.idempotencyKey],
      );
      if (existing.length > 0) {
        return {
          entryId: Number(existing[0].id),
          balance: existing[0].balance_after,
          lifetime: existing[0].lifetime_after,
        };
      }

      const [balance] = await manager.query<
        { balance: number; lifetime: number }[]
      >(
        `
          SELECT balance, lifetime
          FROM user_point_balances
          WHERE user_id = $1
          FOR UPDATE
        `,
        [command.userId],
      );
      const currentBalance = balance?.balance ?? 0;
      const currentLifetime = balance?.lifetime ?? 0;
      const nextBalance = currentBalance + rule.points;
      const nextLifetime =
        currentLifetime + (rule.affects_lifetime ? rule.points : 0);

      const [{ id }] = await manager.query<{ id: string }[]>(
        `
          INSERT INTO point_ledger (
            user_id, rule_code, rule_version, delta, balance_after, lifetime_after,
            reference_type, reference_id, idempotency_key, actor, source
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id
        `,
        [
          command.userId,
          command.ruleCode,
          rule.version,
          rule.points,
          nextBalance,
          nextLifetime,
          command.referenceType,
          command.referenceId,
          command.idempotencyKey,
          command.actor,
          command.source,
        ],
      );

      await manager.query(
        `
          INSERT INTO user_point_balances (user_id, balance, lifetime, last_entry_id)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (user_id) DO UPDATE SET
            balance = EXCLUDED.balance,
            lifetime = EXCLUDED.lifetime,
            last_entry_id = EXCLUDED.last_entry_id,
            updated_at = now()
        `,
        [command.userId, nextBalance, nextLifetime, id],
      );

      return { entryId: Number(id), balance: nextBalance, lifetime: nextLifetime };
    });
  }
}
