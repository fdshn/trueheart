import {
  INotificationChannelRepository,
  INotificationChannelSummary,
  IUpdateNotificationChannelCommand,
  NotificationChannelCodes,
} from '@/domain/ports/repository';
import { ISecretCipher } from '@/domain/ports/security';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface IChannelRow {
  channel: NotificationChannelCodes;
  provider: string;
  enabled: boolean;
  from_address: string | null;
  from_name: string | null;
  host: string | null;
  port: number | string | null;
  username: string | null;
  secret_encrypted: string | null;
  updated_at: Date;
}

/** Các cột Admin sửa được, ngoài secret. */
const EditableColumns = {
  provider: 'provider',
  enabled: 'enabled',
  fromAddress: 'from_address',
  fromName: 'from_name',
  host: 'host',
  port: 'port',
  username: 'username',
} as const;

/**
 * Ánh xạ sang dạng AN TOÀN: `secret_encrypted` chỉ biến thành một cờ boolean.
 * Không có đường nào từ hàm này trả ra ciphertext, nên không endpoint nào lỡ
 * tay để lộ nó.
 */
function toSummary(row: IChannelRow): INotificationChannelSummary {
  return {
    channel: row.channel,
    provider: row.provider,
    enabled: row.enabled,
    fromAddress: row.from_address,
    fromName: row.from_name,
    host: row.host,
    port: row.port === null ? null : Number(row.port),
    username: row.username,
    secretConfigured: row.secret_encrypted !== null,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class NotificationChannelRepository implements INotificationChannelRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    @Inject(ISecretCipher) private readonly cipher: ISecretCipher,
  ) {}

  public async list(): Promise<INotificationChannelSummary[]> {
    const rows = await this.manager.query<IChannelRow[]>(
      `
        SELECT channel, provider, enabled, from_address, from_name,
               host, port, username, secret_encrypted, updated_at
        FROM notification_channels
        ORDER BY channel ASC
      `,
    );

    return rows.map(toSummary);
  }

  public async isSendable(channel: NotificationChannelCodes): Promise<boolean> {
    const [row] = await this.manager.query<
      { enabled: boolean; secret_encrypted: string | null }[]
    >(
      `
        SELECT enabled, secret_encrypted
        FROM notification_channels
        WHERE channel = $1
      `,
      [channel],
    );

    // Bật mà chưa có secret thì vẫn không gửi được. Trả true ở đây nghĩa là
    // hứa với người dùng một tin nhắn mà hệ thống không gửi nổi.
    return row?.enabled === true && row.secret_encrypted !== null;
  }

  public async readSecret(
    channel: NotificationChannelCodes,
  ): Promise<string | null> {
    const [row] = await this.manager.query<
      { secret_encrypted: string | null }[]
    >(
      `
        SELECT secret_encrypted
        FROM notification_channels
        WHERE channel = $1
      `,
      [channel],
    );

    if (!row?.secret_encrypted) return null;

    this.assertCipherReady();
    return this.cipher.decrypt(row.secret_encrypted);
  }

  public async update(
    command: IUpdateNotificationChannelCommand,
  ): Promise<INotificationChannelSummary> {
    // Kiểm khoá TRƯỚC khi chạm database: thiếu khoá thì không được ghi gì cả,
    // chứ không phải ghi nửa vời rồi mới phát hiện không mã hoá được.
    if (command.secret !== undefined && command.secret !== null)
      this.assertCipherReady();

    return this.manager.transaction(async (manager) => {
      const assignments: string[] = [];
      const params: unknown[] = [command.channel];

      for (const [field, column] of Object.entries(EditableColumns)) {
        const value = command[field as keyof IUpdateNotificationChannelCommand];
        if (value === undefined) continue;

        params.push(value);
        assignments.push(`"${column}" = $${params.length}`);
      }

      if (command.secret !== undefined) {
        params.push(
          command.secret === null ? null : this.cipher.encrypt(command.secret),
        );
        assignments.push(`"secret_encrypted" = $${params.length}`);
      }

      params.push(command.actorUserId);
      assignments.push(`"updated_by" = $${params.length}`);
      assignments.push(`"updated_at" = now()`);

      const [updated] = await updateReturning<IChannelRow>(
        manager,
        `
          UPDATE notification_channels
          SET ${assignments.join(', ')}
          WHERE channel = $1
          RETURNING channel, provider, enabled, from_address, from_name,
                    host, port, username, secret_encrypted, updated_at
        `,
        params,
      );

      // Audit ghi CÓ ĐỔI SECRET HAY KHÔNG, tuyệt đối không ghi giá trị —
      // kể cả ciphertext, vì audit log dễ được export ra ngoài hơn bảng config.
      await manager.query(
        `
          INSERT INTO admin_audit_logs
            (actor_user_id, action, resource_type, resource_id, after_json, reason)
          VALUES ($1, 'UPDATE', 'NOTIFICATION_CHANNEL', $2, $3::jsonb, $4)
        `,
        [
          command.actorUserId,
          command.channel,
          JSON.stringify({
            enabled: updated.enabled,
            provider: updated.provider,
            secretChanged: command.secret !== undefined,
            secretConfigured: updated.secret_encrypted !== null,
          }),
          command.reason,
        ],
      );

      return toSummary(updated);
    });
  }

  private assertCipherReady(): void {
    if (!this.cipher.isConfigured)
      throw new Error(
        'Chưa khai CONFIG_ENCRYPTION_KEY nên không mã hoá được secret. ' +
          'Từ chối lưu thay vì ghi bản rõ xuống database.',
      );
  }
}
