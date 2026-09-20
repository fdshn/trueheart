import {
  IAppendPointEntryCommand,
  IAppendPointEntryResult,
} from '@/application/contracts/point';
import {
  PointDailyCapReachedException,
  PointRuleUnavailableException,
} from '@/domain/exceptions';
import {
  IPointLedgerHistoryQuery,
  IPointLedgerPage,
  IPointLedgerRepository,
  IPointLedgerSummary,
} from '@/domain/ports/repository';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

@Injectable()
export class PointLedgerRepository implements IPointLedgerRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async getSummary(userId: string): Promise<IPointLedgerSummary> {
    const [balance] = await this.manager.query<
      { balance: number | string; lifetime: number | string }[]
    >(
      `
        SELECT balance, lifetime
        FROM user_point_balances
        WHERE user_id = $1
      `,
      [userId],
    );

    return {
      balance: Number(balance?.balance ?? 0),
      lifetime: Number(balance?.lifetime ?? 0),
    };
  }

  public async getHistory(
    userId: string,
    query: IPointLedgerHistoryQuery,
  ): Promise<IPointLedgerPage> {
    const entries = await this.manager.query<
      {
        id: number | string;
        rule_code: string;
        rule_version: number | string;
        delta: number | string;
        balance_after: number | string;
        lifetime_after: number | string;
        source: string;
        reason: string | null;
        created_at: Date;
      }[]
    >(
      `
        SELECT id, rule_code, rule_version, delta, balance_after, lifetime_after,
               source, reason, created_at
        FROM point_ledger
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2 OFFSET $3
      `,
      [userId, query.take, query.skip],
    );
    const [{ total }] = await this.manager.query<{ total: number | string }[]>(
      `
        SELECT COUNT(*) AS total
        FROM point_ledger
        WHERE user_id = $1
      `,
      [userId],
    );

    return {
      entries: entries.map((entry) => ({
        entryId: Number(entry.id),
        ruleCode: entry.rule_code,
        ruleVersion: Number(entry.rule_version),
        delta: Number(entry.delta),
        balanceAfter: Number(entry.balance_after),
        lifetimeAfter: Number(entry.lifetime_after),
        source: entry.source,
        reason: entry.reason,
        createdAt: entry.created_at,
      })),
      total: Number(total),
    };
  }

  public async findPhoneVerifiedUsersMissingReward(
    limit: number,
  ): Promise<string[]> {
    const rows = await this.manager.query<{ global_id: string }[]>(
      `
        SELECT user_account.global_id
        FROM users user_account
        WHERE user_account.phone_verified_at IS NOT NULL
          AND user_account.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM point_ledger entry
            WHERE entry.idempotency_key = 'PHONE_VERIFIED_FIRST_TIME:' || user_account.global_id
          )
        ORDER BY user_account.phone_verified_at ASC
        LIMIT $1
      `,
      [limit],
    );

    return rows.map((row) => row.global_id);
  }

  public async appendByRule(
    command: IAppendPointEntryCommand,
  ): Promise<IAppendPointEntryResult> {
    return this.manager.transaction((manager) =>
      this.appendByRuleWithinTransaction(manager, command),
    );
  }

  public async appendByRuleWithinTransaction(
    manager: EntityManager,
    command: IAppendPointEntryCommand,
  ): Promise<IAppendPointEntryResult> {
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

    if (rule.daily_cap !== null) {
      const [{ count }] = await manager.query<{ count: string }[]>(
        `
          SELECT COUNT(*)::text AS count
          FROM point_ledger
          WHERE user_id = $1
            AND rule_code = $2
            AND created_at >= date_trunc('day', timezone('UTC', now())) AT TIME ZONE 'UTC'
            AND created_at < (date_trunc('day', timezone('UTC', now())) + INTERVAL '1 day') AT TIME ZONE 'UTC'
        `,
        [command.userId, command.ruleCode],
      );
      if (Number(count) >= rule.daily_cap) {
        await manager.query(
          `
            INSERT INTO point_cap_decisions
              (user_id, rule_code, policy_date, decision, idempotency_key)
            VALUES ($1, $2, (timezone('UTC', now()))::date, 'REJECTED', $3)
            ON CONFLICT (idempotency_key) DO NOTHING
          `,
          [command.userId, command.ruleCode, command.idempotencyKey],
        );
        throw new PointDailyCapReachedException(
          command.ruleCode,
          rule.daily_cap,
        );
      }
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

    if (rule.daily_cap !== null) {
      await manager.query(
        `
          INSERT INTO point_cap_decisions
            (user_id, rule_code, policy_date, decision, idempotency_key)
          VALUES ($1, $2, (timezone('UTC', now()))::date, 'APPLIED', $3)
          ON CONFLICT (idempotency_key) DO NOTHING
        `,
        [command.userId, command.ruleCode, command.idempotencyKey],
      );
    }

    return {
      entryId: Number(id),
      balance: nextBalance,
      lifetime: nextLifetime,
    };
  }
}
