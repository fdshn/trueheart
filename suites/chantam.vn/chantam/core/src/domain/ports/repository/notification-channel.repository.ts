export type NotificationChannelCodes = 'EMAIL' | 'SMS' | 'ZALO';

/**
 * Cấu hình một kênh gửi, ở dạng AN TOÀN ĐỂ TRẢ RA API.
 *
 * Cố ý không có trường nào chứa secret: chỉ nói đã cấu hình hay chưa. Đặt một
 * trường `secret` ở đây là sớm muộn cũng có endpoint trả nó ra.
 */
export interface INotificationChannelSummary {
  readonly channel: NotificationChannelCodes;
  readonly provider: string;
  readonly enabled: boolean;
  readonly fromAddress: string | null;
  readonly fromName: string | null;
  readonly host: string | null;
  readonly port: number | null;
  readonly username: string | null;
  /** Đã có secret trong database hay chưa. KHÔNG phải giá trị secret. */
  readonly secretConfigured: boolean;
  readonly updatedAt: Date;
}

export interface IUpdateNotificationChannelCommand {
  readonly actorUserId: string;
  readonly channel: NotificationChannelCodes;
  readonly provider?: string;
  readonly enabled?: boolean;
  readonly fromAddress?: string | null;
  readonly fromName?: string | null;
  readonly host?: string | null;
  readonly port?: number | null;
  readonly username?: string | null;
  /**
   * Bản rõ đi VÀO, được mã hoá trước khi ghi, và không bao giờ đi ra.
   * `undefined` = giữ secret cũ, `null` = xoá secret.
   */
  readonly secret?: string | null;
  readonly reason: string;
}

export interface INotificationChannelRepository {
  list(): Promise<INotificationChannelSummary[]>;
  /** Kênh này có thực sự gửi được ngay bây giờ không. */
  isSendable(channel: NotificationChannelCodes): Promise<boolean>;
  update(
    command: IUpdateNotificationChannelCommand,
  ): Promise<INotificationChannelSummary>;
  /**
   * Giải mã secret để ĐI GỬI THẬT.
   *
   * Chỉ adapter gửi được gọi. Không use case nào của Admin được dùng, và không
   * response nào được mang giá trị này ra ngoài — đó là lý do nó tách khỏi
   * `list()` thay vì thêm một trường vào summary.
   */
  readSecret(channel: NotificationChannelCodes): Promise<string | null>;
}

export const INotificationChannelRepository = Symbol(
  'INotificationChannelRepository',
);
