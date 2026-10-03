import {
  ICreateBroadcastParams,
  INotificationBroadcast,
  INotificationBroadcastRepository,
} from '@/domain/ports/repository';
import {
  BroadcastAudienceType,
  BroadcastStatus,
  IBroadcastAudience,
  describeBroadcastAudience,
} from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface IRow {
  global_id: string;
  audience_type: string;
  group_id: string | null;
  center_lat: number | null;
  center_lng: number | null;
  radius_meters: number | null;
  notification_type: string;
  title: string;
  body: string;
  status: string;
  audience_count: number;
  notified_count: number;
  already_sent_count: number;
  failed_count: number;
  last_user_id: string;
  failure_reason: string | null;
  created_by: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

/**
 * `center_location` là `geography`, không đọc ra số được — phải bóc bằng `ST_Y`/`ST_X`.
 *
 * Thứ tự: `ST_Y` là VĨ ĐỘ (lat), `ST_X` là KINH ĐỘ (lng). Đổi chỗ hai cái là biến Sài Gòn
 * thành một điểm ngoài khơi Somalia, và không câu truy vấn nào báo lỗi.
 */
const Columns = `global_id, audience_type, group_id,
       ST_Y(center_location::geometry) AS center_lat,
       ST_X(center_location::geometry) AS center_lng,
       radius_meters, notification_type, title, body, status,
       audience_count, notified_count, already_sent_count, failed_count,
       last_user_id, failure_reason, created_by, created_at, started_at, completed_at`;

function toAudience(row: IRow): IBroadcastAudience {
  return {
    type: row.audience_type as BroadcastAudienceType,
    groupId: row.group_id,
    centerLat: row.center_lat === null ? null : Number(row.center_lat),
    centerLng: row.center_lng === null ? null : Number(row.center_lng),
    radiusMeters: row.radius_meters === null ? null : Number(row.radius_meters),
  };
}

function toBroadcast(row: IRow): INotificationBroadcast {
  const audience = toAudience(row);

  return {
    globalId: row.global_id,
    audience,
    audienceLabel: describeBroadcastAudience(audience),
    notificationType: row.notification_type,
    title: row.title,
    body: row.body,
    status: row.status as BroadcastStatus,
    audienceCount: Number(row.audience_count),
    notifiedCount: Number(row.notified_count),
    alreadySentCount: Number(row.already_sent_count),
    failedCount: Number(row.failed_count),
    // `bigint` về đây là CHUỖI. Dùng thẳng nó làm con trỏ `WHERE id > $1` thì Postgres vẫn
    // chạy, nhưng mọi phép so ở tầng JS đều sai.
    lastUserId: Number(row.last_user_id),
    failureReason: row.failure_reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

/** Mảnh SQL dựng `center_location` từ hai tham số, hoặc `NULL`. */
const CenterExpression = `CASE
  WHEN $4::float8 IS NULL THEN NULL
  ELSE ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography
END`;

@Injectable()
export class NotificationBroadcastRepository implements INotificationBroadcastRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async create(
    params: ICreateBroadcastParams,
  ): Promise<INotificationBroadcast> {
    const [row] = await this.manager.query<IRow[]>(
      `INSERT INTO notification_broadcasts
         (audience_type, group_id, center_location, radius_meters,
          notification_type, title, body, created_by, audience_count)
       VALUES ($1, $2, ${CenterExpression}, $3, $6, $7, $8, $9, $10)
       RETURNING ${Columns}`,
      [
        params.audience.type,
        params.audience.groupId,
        params.audience.radiusMeters,
        params.audience.centerLat,
        params.audience.centerLng,
        params.notificationType,
        params.title,
        params.body,
        params.actorUserId,
        // Đếm trước để Admin thấy ngay con số. CLI vẫn đếm lại khi chạy — số người đổi
        // giữa lúc tạo và lúc gửi là chuyện thường, và con số lúc GỬI mới là con số thật.
        await this.countAudience(params.audience),
      ],
    );
    return toBroadcast(row);
  }

  public async findByGlobalId(
    globalId: string,
  ): Promise<INotificationBroadcast | null> {
    const [row] = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM notification_broadcasts WHERE global_id = $1`,
      [globalId],
    );
    return row ? toBroadcast(row) : null;
  }

  public async listRecent(query: {
    limit: number;
    offset: number;
  }): Promise<{ items: INotificationBroadcast[]; total: number }> {
    const rows = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM notification_broadcasts
        ORDER BY created_at DESC, id DESC
        LIMIT $1 OFFSET $2`,
      [query.limit, query.offset],
    );
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM notification_broadcasts`,
    );

    return {
      items: (rows ?? []).map(toBroadcast),
      total: Number(counted?.total ?? 0),
    };
  }

  /**
   * Lượt gửi cũ nhất còn dở.
   *
   * `SENDING` cũng vào đây. Một lượt chạy chết giữa đường để lại trạng thái đó, và nếu chỉ
   * nhặt `PENDING` thì nó treo mãi — không ai gửi nốt, không ai biết nó dở.
   */
  public async findNextPending(): Promise<INotificationBroadcast | null> {
    const [row] = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM notification_broadcasts
        WHERE status IN ('PENDING', 'SENDING')
        ORDER BY created_at ASC, id ASC
        LIMIT 1`,
    );
    return row ? toBroadcast(row) : null;
  }

  public async markSending(globalId: string): Promise<void> {
    await updateReturning(
      this.manager,
      `UPDATE notification_broadcasts
          SET status = 'SENDING',
              started_at = COALESCE(started_at, now())
        WHERE global_id = $1
        RETURNING global_id`,
      [globalId],
    );
  }

  /**
   * Cộng dồn tiến độ, không ghi đè.
   *
   * `count = count + $n` chứ không `count = $n`: lượt chạy lại tiếp từ con trỏ, nên nó chỉ
   * biết số của PHẦN nó vừa làm. Ghi đè sẽ xoá sạch số của lượt chạy trước.
   */
  public async recordProgress(params: {
    globalId: string;
    lastUserId: number;
    audienceDelta: number;
    notifiedDelta: number;
    alreadySentDelta: number;
    failedDelta: number;
  }): Promise<void> {
    await updateReturning(
      this.manager,
      `UPDATE notification_broadcasts
          SET last_user_id = $2,
              audience_count = audience_count + $3,
              notified_count = notified_count + $4,
              already_sent_count = already_sent_count + $5,
              failed_count = failed_count + $6
        WHERE global_id = $1
        RETURNING global_id`,
      [
        params.globalId,
        params.lastUserId,
        params.audienceDelta,
        params.notifiedDelta,
        params.alreadySentDelta,
        params.failedDelta,
      ],
    );
  }

  public async markCompleted(globalId: string): Promise<void> {
    await updateReturning(
      this.manager,
      `UPDATE notification_broadcasts
          SET status = 'COMPLETED', completed_at = now()
        WHERE global_id = $1
        RETURNING global_id`,
      [globalId],
    );
  }

  public async markFailed(globalId: string, reason: string): Promise<void> {
    await updateReturning(
      this.manager,
      `UPDATE notification_broadcasts
          SET status = 'FAILED', completed_at = now(),
              failure_reason = left($2, 500)
        WHERE global_id = $1
        RETURNING global_id`,
      [globalId, reason],
    );
  }

  /**
   * Đếm người nhận.
   *
   * Dùng ĐÚNG mệnh đề lọc mà `findActiveUserIdsAfter` dùng — nếu hai chỗ lệch nhau thì
   * Admin thấy "sẽ gửi cho 1.200 người" rồi nhận được báo cáo 800, và không ai biết 400
   * người kia đi đâu. `test:broadcast` nhóm 2 đo đúng điều đó.
   */
  public async countAudience(audience: IBroadcastAudience): Promise<number> {
    const values: unknown[] = [];
    let filter = '';

    if (audience.type === 'GROUP') {
      values.push(audience.groupId);
      filter = `AND EXISTS (
        SELECT 1 FROM group_memberships member
         WHERE member.user_id = users.global_id
           AND member.group_id = $${values.length}
           AND member.status = 'ACTIVE'
      )`;
    } else if (audience.type === 'AREA') {
      values.push(
        audience.centerLng,
        audience.centerLat,
        audience.radiusMeters,
      );
      filter = `AND users.default_location IS NOT NULL
        AND ST_DWithin(
          users.default_location,
          ST_SetSRID(ST_MakePoint($${values.length - 2}, $${values.length - 1}), 4326)::geography,
          $${values.length}
        )`;
    }

    const [row] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM users
        WHERE users.status = 'ACTIVE'
          AND users.deleted_at IS NULL
          ${filter}`,
      values,
    );
    return Number(row?.total ?? 0);
  }
}
