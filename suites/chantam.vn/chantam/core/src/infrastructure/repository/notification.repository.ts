import {
  ICreateNotificationParams,
  INotificationRepository,
} from '@/domain/ports/repository';
import { NotificationEntity } from '@/infrastructure/entity';
import { NotificationGroups } from '@chantam.vn/chantam.core-lib/consts';
import { INotificationEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

@Injectable()
export class NotificationRepository implements INotificationRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  private async insert(
    manager: EntityManager,
    params: ICreateNotificationParams,
  ): Promise<INotificationEntity | null> {
    // `ON CONFLICT DO NOTHING` trên `idempotency_key` UNIQUE: trùng khoá là
    // "đã có rồi", một kết quả bình thường chứ không phải sự cố. INSERT không
    // bị bọc kết quả nên đọc thẳng được.
    const rows = await manager.query<{ global_id: string }[]>(
      `
        INSERT INTO notifications
          (global_id, user_id, type, title, body,
           reference_type, reference_id, idempotency_key)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT ("idempotency_key") DO NOTHING
        RETURNING global_id
      `,
      [
        params.globalId,
        params.userId,
        params.type,
        params.title,
        params.body,
        params.referenceType ?? null,
        params.referenceId ?? null,
        params.idempotencyKey ?? null,
      ],
    );

    if (rows.length === 0) return null;

    return manager.findOne(NotificationEntity, {
      where: { globalId: rows[0].global_id },
    });
  }

  public async create(
    params: ICreateNotificationParams,
  ): Promise<INotificationEntity | null> {
    return this.insert(this.manager, params);
  }

  public async createWithinTransaction(
    manager: EntityManager,
    params: ICreateNotificationParams,
  ): Promise<INotificationEntity | null> {
    return this.insert(manager, params);
  }

  public async listForUser(params: {
    userId: string;
    unreadOnly: boolean;
    skip: number;
    take: number;
  }): Promise<{
    items: INotificationEntity[];
    total: number;
    unreadCount: number;
  }> {
    const query = this.manager
      .createQueryBuilder(NotificationEntity, 'notification')
      .where('notification.userId = :userId', { userId: params.userId });

    if (params.unreadOnly) query.andWhere('notification.readAt IS NULL');

    const [items, total] = await query
      .orderBy('notification.createdAt', 'DESC')
      .addOrderBy('notification.id', 'DESC')
      .skip(params.skip)
      .take(params.take)
      .getManyAndCount();

    // Badge đếm TOÀN BỘ chưa đọc, không phụ thuộc trang hay bộ lọc đang xem —
    // nếu không, mở trang 2 là badge tụt xuống mà chẳng ai đọc gì.
    const [{ unread }] = await this.manager.query<{ unread: string }[]>(
      `SELECT COUNT(*) AS unread FROM notifications
        WHERE user_id = $1 AND read_at IS NULL`,
      [params.userId],
    );

    return { items, total, unreadCount: Number(unread) };
  }

  public async markRead(params: {
    userId: string;
    notificationIds?: string[];
  }): Promise<{ markedCount: number; unreadCount: number }> {
    const ids = params.notificationIds ?? [];
    const all = ids.length === 0;

    // Luôn có `user_id = $1`: thiếu vế đó là cho người này đánh dấu hộ thông
    // báo của người khác. Mệnh đề id chỉ thu hẹp thêm.
    const marked = await updateReturning<{ global_id: string }>(
      this.manager,
      `
        UPDATE notifications
        SET read_at = now()
        WHERE user_id = $1
          AND read_at IS NULL
          AND ($2::boolean OR global_id = ANY($3::uuid[]))
        RETURNING global_id
      `,
      [params.userId, all, ids],
    );

    const [{ unread }] = await this.manager.query<{ unread: string }[]>(
      `SELECT COUNT(*) AS unread FROM notifications
        WHERE user_id = $1 AND read_at IS NULL`,
      [params.userId],
    );

    return { markedCount: marked.length, unreadCount: Number(unread) };
  }

  public async listMutedGroups(userId: string): Promise<NotificationGroups[]> {
    const rows = await this.manager.query<{ notification_group: string }[]>(
      `SELECT notification_group FROM notification_mutes WHERE user_id = $1`,
      [userId],
    );

    // Lọc qua enum: một giá trị lạ còn sót trong bảng (đổi tên nhóm, sửa tay)
    // không được biến thành một nhóm không ai bật lại được.
    const known = new Set<string>(Object.values(NotificationGroups));
    return rows
      .map((row) => row.notification_group)
      .filter((group): group is NotificationGroups => known.has(group))
      .map((group) => group as NotificationGroups);
  }

  public async setGroupMuted(params: {
    userId: string;
    group: NotificationGroups;
    muted: boolean;
  }): Promise<void> {
    if (params.muted) {
      await this.manager.query(
        `INSERT INTO notification_mutes (user_id, notification_group)
         VALUES ($1, $2)
         ON CONFLICT (user_id, notification_group) DO NOTHING`,
        [params.userId, params.group],
      );
      return;
    }

    await this.manager.query(
      `DELETE FROM notification_mutes
       WHERE user_id = $1 AND notification_group = $2`,
      [params.userId, params.group],
    );
  }

  public async purgeOlderThan(params: {
    olderThanDays: number;
    limit: number;
  }): Promise<number> {
    // Xoá theo lô: một lần chạy trên bảng đã tích nhiều năm sẽ khoá bảng lâu và
    // thổi phồng WAL. Job gọi lại cho tới khi hết.
    const rows = await updateReturning<{ id: string }>(
      this.manager,
      `
        DELETE FROM notifications
        WHERE id IN (
          SELECT id FROM notifications
          WHERE created_at < now() - ($1 || ' days')::interval
          ORDER BY created_at ASC
          LIMIT $2
        )
        RETURNING id
      `,
      [String(params.olderThanDays), params.limit],
    );

    return rows.length;
  }

  public async findPushTokens(userId: string): Promise<string[]> {
    // Chỉ phiên còn sống: phiên đã thu hồi hoặc hết hạn vẫn còn token, và gửi
    // tới đó là thông báo bay vào máy người dùng đã đăng xuất.
    const rows = await this.manager.query<{ fcm_token: string }[]>(
      `
        SELECT DISTINCT fcm_token
        FROM user_sessions
        WHERE user_id = $1
          AND fcm_token IS NOT NULL
          AND revoked_at IS NULL
          AND expires_at > now()
      `,
      [userId],
    );
    return rows.map((row) => row.fcm_token);
  }

  public async markPushed(notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) return;

    await this.manager.query(
      `UPDATE notifications SET pushed_at = now() WHERE global_id = ANY($1::uuid[])`,
      [notificationIds],
    );
  }
}
