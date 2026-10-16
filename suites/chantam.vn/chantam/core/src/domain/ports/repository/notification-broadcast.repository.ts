import {
  BroadcastStatus,
  IBroadcastAudience,
} from '@chantam.vn/chantam.core-lib/models';

export interface INotificationBroadcast {
  globalId: string;
  audience: IBroadcastAudience;
  audienceLabel: string;
  notificationType: string;
  title: string;
  body: string;
  status: BroadcastStatus;
  audienceCount: number;
  notifiedCount: number;
  alreadySentCount: number;
  failedCount: number;
  /** Con trỏ tiếp tục — người cuối đã xử lý. */
  lastUserId: number;
  failureReason: string | null;
  createdBy: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface ICreateBroadcastParams {
  actorUserId: string;
  audience: IBroadcastAudience;
  notificationType: string;
  title: string;
  body: string;
}

export interface INotificationBroadcastRepository {
  create(params: ICreateBroadcastParams): Promise<INotificationBroadcast>;
  findByGlobalId(globalId: string): Promise<INotificationBroadcast | null>;
  listRecent(query: {
    limit: number;
    offset: number;
  }): Promise<{ items: INotificationBroadcast[]; total: number }>;
  /**
   * Lượt gửi cũ nhất còn dở, hoặc `null`.
   *
   * `SENDING` cũng tính: một lượt chạy chết giữa đường để lại trạng thái đó, và nó phải
   * được nhặt lại chứ không treo mãi. Con trỏ `lastUserId` làm việc nhặt lại đó rẻ.
   */
  findNextPending(): Promise<INotificationBroadcast | null>;
  /**
   * NHẬN một lượt gửi để làm, trong MỘT câu lệnh — chỉ khớp khi chưa ai giữ hoặc lease
   * của người trước đã hết hạn. Trả `null` khi không còn lượt nào nhận được.
   *
   * `globalId: null` là đường cron: lượt cũ nhất `PENDING`/`SENDING`. Có `globalId` là
   * "Gửi ngay" của CMS: nhận đúng lượt đó, kể cả `FAILED` (gửi lại sau sự cố).
   */
  claimForSending(params: {
    globalId: string | null;
    leaseSeconds: number;
  }): Promise<INotificationBroadcast | null>;
  /** Ghi tiến độ sau mỗi lô, kèm con trỏ — và gia hạn lease. */
  recordProgress(params: {
    globalId: string;
    leaseSeconds: number;
    lastUserId: number;
    audienceDelta: number;
    notifiedDelta: number;
    alreadySentDelta: number;
    failedDelta: number;
  }): Promise<void>;
  markCompleted(globalId: string): Promise<void>;
  markFailed(globalId: string, reason: string): Promise<void>;
  /** Đếm trước số người nhận, để `POST` trả về một con số Admin xem được ngay. */
  countAudience(audience: IBroadcastAudience): Promise<number>;
}

export const INotificationBroadcastRepository = Symbol(
  'INotificationBroadcastRepository',
);
