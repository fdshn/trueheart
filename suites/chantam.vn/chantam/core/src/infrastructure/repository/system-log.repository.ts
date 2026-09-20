import {
  ISystemLogEntry,
  ISystemLogPage,
  ISystemLogQuery,
  ISystemLogRepository,
  SystemLogTypes,
} from '@/domain/ports/repository';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

interface IRawLogRow {
  occurred_at: Date;
  actor_user_id: string | null;
  subject_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  detail: string | null;
}

/**
 * Mỗi loại log ánh xạ về cùng một hình dạng từ nguồn thật của nó.
 *
 * `table` là tên bảng, `columns` là phép chiếu sang các cột chuẩn hoá, và
 * `userColumn` là cột dùng khi lọc theo người — khác nhau giữa các nguồn nên
 * không thể lọc chung một tên.
 */
const Sources: Record<
  SystemLogTypes,
  { table: string; columns: string; userColumn: string; actionColumn: string }
> = {
  ADMIN: {
    table: 'admin_audit_logs',
    columns: `
      created_at AS occurred_at,
      actor_user_id,
      NULL::uuid AS subject_user_id,
      action,
      resource_type,
      resource_id,
      reason AS detail
    `,
    userColumn: 'actor_user_id',
    actionColumn: 'action',
  },
  POINT: {
    table: 'point_ledger',
    columns: `
      created_at AS occurred_at,
      NULL::uuid AS actor_user_id,
      user_id AS subject_user_id,
      rule_code AS action,
      'POINT_LEDGER' AS resource_type,
      reference_id AS resource_id,
      reason AS detail
    `,
    userColumn: 'user_id',
    actionColumn: 'rule_code',
  },
  RANK: {
    table: 'rank_transitions',
    columns: `
      created_at AS occurred_at,
      NULL::uuid AS actor_user_id,
      user_id AS subject_user_id,
      reason AS action,
      'RANK_TRANSITION' AS resource_type,
      NULL AS resource_id,
      (from_rank || ' -> ' || to_rank) AS detail
    `,
    userColumn: 'user_id',
    actionColumn: 'reason',
  },
  TRANSACTION: {
    table: 'gift_transactions',
    columns: `
      requested_at AS occurred_at,
      giver_id AS actor_user_id,
      receiver_id AS subject_user_id,
      status AS action,
      'GIFT_TRANSACTION' AS resource_type,
      global_id::text AS resource_id,
      close_reason AS detail
    `,
    // Lọc theo người phải bắt CẢ hai vai, nếu không thì tra cứu một người chỉ
    // ra được nửa số giao dịch của họ.
    userColumn: 'COALESCE_USER',
    actionColumn: 'status',
  },
};

function toEntry(logType: SystemLogTypes, row: IRawLogRow): ISystemLogEntry {
  return {
    logType,
    occurredAt: row.occurred_at,
    actorUserId: row.actor_user_id,
    subjectUserId: row.subject_user_id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    detail: row.detail,
  };
}

@Injectable()
export class SystemLogRepository implements ISystemLogRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async query(query: ISystemLogQuery): Promise<ISystemLogPage> {
    const source = Sources[query.logType];
    const conditions: string[] = [];
    const filters: unknown[] = [];
    const add = (sql: string, value: unknown): void => {
      if (value === undefined) return;

      filters.push(value);
      // `replaceAll` chứ không `replace`: lọc giao dịch theo người dùng cùng
      // một tham số ở hai vế (người tặng và người nhận).
      conditions.push(sql.replaceAll('$?', `$${filters.length}`));
    };

    if (query.userId !== undefined)
      add(
        source.userColumn === 'COALESCE_USER'
          ? '(giver_id = $? OR receiver_id = $?)'
          : `${source.userColumn} = $?`,
        query.userId,
      );
    add(`${source.actionColumn} = $?`, query.action);
    add(`${this.timeColumn(query.logType)} >= $?`, query.from);
    add(`${this.timeColumn(query.logType)} <= $?`, query.to);

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.manager.query<IRawLogRow[]>(
      `
        SELECT ${source.columns}
        FROM ${source.table}
        ${where}
        ORDER BY ${this.timeColumn(query.logType)} DESC
        LIMIT $${filters.length + 1} OFFSET $${filters.length + 2}
      `,
      [...filters, query.take, query.skip],
    );

    const [{ total }] = await this.manager.query<{ total: string }[]>(
      `SELECT COUNT(*) AS total FROM ${source.table} ${where}`,
      filters,
    );

    return {
      entries: rows.map((row) => toEntry(query.logType, row)),
      total: Number(total),
    };
  }

  private timeColumn(logType: SystemLogTypes): string {
    return logType === 'TRANSACTION' ? 'requested_at' : 'created_at';
  }
}
