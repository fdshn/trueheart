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
  IReversePointEntryParams,
  ReversePointEntryOutcome,
} from '@/domain/ports/repository';
import { formatPointLogNote } from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * Nhân điểm của rule với phần trăm, cho F40.
 *
 * Tách thành hàm thuần để mọi phép làm tròn và mọi ranh giới nằm ở đúng một
 * chỗ kiểm được, thay vì rải trong một câu lệnh dài giữa hai lần đi database.
 */
function scaleRulePoints(
  rulePoints: number,
  multiplierPercent: number | undefined,
): number {
  if (multiplierPercent === undefined) return rulePoints;

  // Khoản phạt không nhân. "Phạt 60% của −50" không có nghĩa nghiệp vụ nào, và
  // cho phép nó là mở đường giảm nhẹ hình phạt bằng một tham số không ai thấy.
  if (rulePoints < 0)
    throw new Error(
      'multiplierPercent chỉ áp cho khoản cộng, không áp cho khoản phạt',
    );

  // Kẹp thay vì ném: giá trị ngoài khoảng đến từ dữ liệu người dùng chấm, và
  // một con số 140 do client hỏng gửi lên không nên làm đổ cả lượt trao.
  const percent = Math.min(100, Math.max(0, multiplierPercent));

  return Math.round((rulePoints * percent) / 100);
}

@Injectable()
export class PointLedgerRepository implements IPointLedgerRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async getSummary(userId: string): Promise<IPointLedgerSummary> {
    const [balance] = await this.manager.query<
      {
        balance: number | string;
        raw_balance: number | string;
        lifetime: number | string;
      }[]
    >(
      `
        SELECT balance, raw_balance, lifetime
        FROM user_point_balances
        WHERE user_id = $1
      `,
      [userId],
    );

    // Đếm từ chính ledger chứ không thêm hai cột đếm trên projection: ledger đã
    // là bản ghi đầy đủ, và một bộ đếm riêng là con số thứ hai nói về cùng một
    // sự thật — sớm muộn lệch nhau.
    const [counts] = await this.manager.query<
      { credits: string; debits: string }[]
    >(
      `
        SELECT
          COUNT(*) FILTER (WHERE delta > 0) AS credits,
          COUNT(*) FILTER (WHERE delta < 0) AS debits
        FROM point_ledger
        WHERE user_id = $1
      `,
      [userId],
    );

    return {
      balance: Number(balance?.balance ?? 0),
      rawBalance: Number(balance?.raw_balance ?? 0),
      lifetime: Number(balance?.lifetime ?? 0),
      creditCount: Number(counts?.credits ?? 0),
      debitCount: Number(counts?.debits ?? 0),
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
        raw_balance_after: number | string;
        lifetime_after: number | string;
        source: string;
        reason: string | null;
        created_at: Date;
      }[]
    >(
      `
        SELECT id, rule_code, rule_version, delta, balance_after,
               raw_balance_after, lifetime_after,
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
        rawBalanceAfter: Number(entry.raw_balance_after),
        note: formatPointLogNote(
          Number(entry.delta),
          Number(entry.raw_balance_after),
        ),
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

  /** Mã rule cho bút toán hoàn. */
  private static readonly ReversalRuleCode = 'REVERSAL';

  public async reverseEntry(
    params: IReversePointEntryParams,
  ): Promise<ReversePointEntryOutcome> {
    return this.manager.transaction(async (manager) => {
      const [original] = await manager.query<
        {
          user_id: string;
          rule_code: string;
          delta: number;
          lifetime_delta: number;
        }[]
      >(
        `
          SELECT entry.user_id, entry.rule_code, entry.delta,
                 -- Bút toán này có đẩy lifetime hay không: so với dòng liền
                 -- trước của cùng người. Đọc từ chính ledger chứ không tra lại
                 -- point_rules, vì rule có thể đã đổi hoặc bị tắt từ lúc ghi.
                 entry.lifetime_after - COALESCE((
                   SELECT prev.lifetime_after FROM point_ledger prev
                   WHERE prev.user_id = entry.user_id AND prev.id < entry.id
                   ORDER BY prev.id DESC LIMIT 1
                 ), 0) AS lifetime_delta
          FROM point_ledger entry
          WHERE entry.id = $1
          FOR UPDATE
        `,
        [params.entryId],
      );
      if (!original) return { status: 'NOT_FOUND' as const };

      // Hoàn một bút toán hoàn là mở đường cho vòng lặp vô nghĩa.
      if (original.rule_code === PointLedgerRepository.ReversalRuleCode)
        return { status: 'NOT_REVERSIBLE' as const };

      const idempotencyKey = `REVERSAL:${params.entryId}`;
      const [existing] = await manager.query<{ id: string }[]>(
        `SELECT id FROM point_ledger WHERE idempotency_key = $1`,
        [idempotencyKey],
      );
      if (existing) return { status: 'NOT_REVERSIBLE' as const };

      const [balance] = await manager.query<
        { balance: number; raw_balance: number; lifetime: number }[]
      >(
        `
          SELECT balance, raw_balance, lifetime
          FROM user_point_balances WHERE user_id = $1 FOR UPDATE
        `,
        [original.user_id],
      );

      const delta = -Number(original.delta);
      const nextRawBalance = Number(balance?.raw_balance ?? 0) + delta;
      const nextBalance = Math.max(0, nextRawBalance);

      // Hoàn KHÁC phạt. Phạt không được trừ lifetime — đó là viết lại lịch sử
      // đóng góp. Nhưng hoàn một khoản thưởng ghi nhầm thì PHẢI trừ, nếu không
      // sàn hạng của người đó bị thổi lên vĩnh viễn bởi một lỗi nhập liệu.
      const nextLifetime = Math.max(
        0,
        Number(balance?.lifetime ?? 0) - Number(original.lifetime_delta),
      );

      const [{ id }] = await manager.query<{ id: string }[]>(
        `
          INSERT INTO point_ledger (
            user_id, rule_code, rule_version, delta, balance_after,
            raw_balance_after, lifetime_after,
            reference_type, reference_id, idempotency_key, actor, source, reason
          ) VALUES ($1, $2, 0, $3, $4, $5, $6, 'POINT_LEDGER', $7, $8, $9, 'ADMIN', $10)
          RETURNING id
        `,
        [
          original.user_id,
          PointLedgerRepository.ReversalRuleCode,
          delta,
          nextBalance,
          nextRawBalance,
          nextLifetime,
          String(params.entryId),
          idempotencyKey,
          params.actorUserId,
          params.reason,
        ],
      );

      await manager.query(
        `
          INSERT INTO user_point_balances
            (user_id, balance, raw_balance, lifetime, last_entry_id)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id) DO UPDATE SET
            balance = EXCLUDED.balance,
            raw_balance = EXCLUDED.raw_balance,
            lifetime = EXCLUDED.lifetime,
            last_entry_id = EXCLUDED.last_entry_id,
            updated_at = now()
        `,
        [original.user_id, nextBalance, nextRawBalance, nextLifetime, id],
      );

      return {
        status: 'REVERSED' as const,
        userId: original.user_id,
        result: {
          entryId: Number(id),
          delta,
          balance: nextBalance,
          rawBalance: nextRawBalance,
          lifetime: nextLifetime,
          applied: true,
        },
      };
    });
  }

  public async appendByRule(
    command: IAppendPointEntryCommand,
  ): Promise<IAppendPointEntryResult> {
    return this.manager.transaction((manager) =>
      this.appendByRuleWithinTransaction(manager, command),
    );
  }

  public async appendAdjustment(command: {
    userId: string;
    ruleCode: string;
    delta: number;
    referenceType: string;
    referenceId: string;
    idempotencyKey: string;
    actor: string;
    source: string;
    reason: string;
  }): Promise<IAppendPointEntryResult> {
    if (command.delta === 0)
      throw new Error('appendAdjustment: delta phải khác 0');
    if (command.reason.trim().length === 0)
      throw new Error('appendAdjustment: reason không được để trống');

    return this.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        command.userId,
      ]);

      const [existing] = await manager.query<
        {
          id: string;
          delta: number;
          balance_after: number;
          raw_balance_after: number;
          lifetime_after: number;
        }[]
      >(
        `SELECT id, delta, balance_after, raw_balance_after, lifetime_after
         FROM point_ledger WHERE idempotency_key = $1`,
        [command.idempotencyKey],
      );
      if (existing)
        return {
          entryId: Number(existing.id),
          delta: Number(existing.delta),
          balance: Number(existing.balance_after),
          rawBalance: Number(existing.raw_balance_after),
          lifetime: Number(existing.lifetime_after),
          applied: false,
        };

      const [balance] = await manager.query<
        { balance: number; raw_balance: number; lifetime: number }[]
      >(
        `SELECT balance, raw_balance, lifetime
         FROM user_point_balances WHERE user_id = $1 FOR UPDATE`,
        [command.userId],
      );

      const nextRawBalance = Number(balance?.raw_balance ?? 0) + command.delta;
      const nextBalance = Math.max(0, nextRawBalance);
      // Khoản trừ KHÔNG hạ lifetime: đó là một sự kiện có thật, không phải lời
      // phủ nhận một khoản cộng trước đó.
      const nextLifetime =
        Number(balance?.lifetime ?? 0) + Math.max(0, command.delta);

      const [{ id }] = await manager.query<{ id: string }[]>(
        `
          INSERT INTO point_ledger (
            user_id, rule_code, rule_version, delta, balance_after,
            raw_balance_after, lifetime_after,
            reference_type, reference_id, idempotency_key, actor, source, reason
          ) VALUES ($1, $2, 0, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id
        `,
        [
          command.userId,
          command.ruleCode,
          command.delta,
          nextBalance,
          nextRawBalance,
          nextLifetime,
          command.referenceType,
          command.referenceId,
          command.idempotencyKey,
          command.actor,
          command.source,
          // Lý do nghiệp vụ TRƯỚC, rồi tới câu số học dựng ở máy chủ. Người bị
          // trừ điểm cần biết vì sao, không chỉ biết còn bao nhiêu.
          `${command.reason} — ${formatPointLogNote(command.delta, nextRawBalance)}`,
        ],
      );

      await manager.query(
        `
          INSERT INTO user_point_balances
            (user_id, balance, raw_balance, lifetime, last_entry_id)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id) DO UPDATE SET
            balance = EXCLUDED.balance,
            raw_balance = EXCLUDED.raw_balance,
            lifetime = EXCLUDED.lifetime,
            last_entry_id = EXCLUDED.last_entry_id,
            updated_at = now()
        `,
        [command.userId, nextBalance, nextRawBalance, nextLifetime, id],
      );

      return {
        entryId: Number(id),
        delta: command.delta,
        balance: nextBalance,
        rawBalance: nextRawBalance,
        lifetime: nextLifetime,
        applied: true,
      };
    });
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
      {
        id: string;
        delta: number;
        balance_after: number;
        raw_balance_after: number;
        lifetime_after: number;
      }[]
    >(
      `
          SELECT id, delta, balance_after, raw_balance_after, lifetime_after
          FROM point_ledger
          WHERE idempotency_key = $1
        `,
      [command.idempotencyKey],
    );
    if (existing.length > 0) {
      return {
        entryId: Number(existing[0].id),
        delta: Number(existing[0].delta),
        balance: Number(existing[0].balance_after),
        rawBalance: Number(existing[0].raw_balance_after),
        lifetime: Number(existing[0].lifetime_after),
        // Đã ghi từ trước: lần gọi này không đổi gì.
        applied: false,
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
      { balance: number; raw_balance: number; lifetime: number }[]
    >(
      `
          SELECT balance, raw_balance, lifetime
          FROM user_point_balances
          WHERE user_id = $1
          FOR UPDATE
        `,
      [command.userId],
    );
    const currentRawBalance = balance?.raw_balance ?? 0;
    const currentLifetime = balance?.lifetime ?? 0;

    const delta = scaleRulePoints(rule.points, command.multiplierPercent);

    // Giá trị THẬT cộng dồn, có thể âm. Đây là sự thật số học — "trừ 50 khi
    // đang có 20" phải đọc ra được là đang âm 30, chứ không phải "về 0".
    const nextRawBalance = currentRawBalance + delta;

    // Số tiêu được thì kẹp ở 0. Ràng buộc `balance_after >= 0` ở database là
    // lớp chặn cuối; kẹp ở đây để không bao giờ chạm tới nó bằng một lỗi 500.
    const nextBalance = Math.max(0, nextRawBalance);

    // `lifetime` chỉ tăng theo quy ước ledger, nên khoản phạt KHÔNG được trừ
    // vào nó — trừ lifetime là viết lại lịch sử đóng góp, và cột đó có ràng
    // buộc `>= 0` riêng.
    const nextLifetime =
      currentLifetime + (rule.affects_lifetime ? Math.max(0, delta) : 0);

    const [{ id }] = await manager.query<{ id: string }[]>(
      `
          INSERT INTO point_ledger (
            user_id, rule_code, rule_version, delta, balance_after,
            raw_balance_after, lifetime_after,
            reference_type, reference_id, idempotency_key, actor, source, reason
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id
        `,
      [
        command.userId,
        command.ruleCode,
        rule.version,
        delta,
        nextBalance,
        nextRawBalance,
        nextLifetime,
        command.referenceType,
        command.referenceId,
        command.idempotencyKey,
        command.actor,
        command.source,
        command.reason ?? null,
      ],
    );

    await manager.query(
      `
          INSERT INTO user_point_balances
            (user_id, balance, raw_balance, lifetime, last_entry_id)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id) DO UPDATE SET
            balance = EXCLUDED.balance,
            raw_balance = EXCLUDED.raw_balance,
            lifetime = EXCLUDED.lifetime,
            last_entry_id = EXCLUDED.last_entry_id,
            updated_at = now()
        `,
      [command.userId, nextBalance, nextRawBalance, nextLifetime, id],
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
      // `delta`, không `rule.points`: khi có hệ số nhân, hai giá trị này khác
      // nhau, và trả về mức trần của rule là nói sai với chỗ gọi về số điểm
      // vừa cộng — cả `settled` trong job đối soát lẫn màn hình người dùng đều
      // đọc con số này.
      entryId: Number(id),
      delta,
      balance: nextBalance,
      rawBalance: nextRawBalance,
      lifetime: nextLifetime,
      applied: true,
    };
  }
}
