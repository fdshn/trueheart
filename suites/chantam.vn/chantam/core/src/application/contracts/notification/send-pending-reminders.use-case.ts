import { IUseCase } from '@chantam/service.common-lib/use-case';

export interface ISendPendingRemindersCommand {
  readonly dryRun?: boolean;
  readonly limit?: number;
}

export interface ISendPendingRemindersResult {
  /** Lời nhắc đánh giá đã gửi. */
  readonly reviewReminders: number;
  /** Lời nhắc nhiệm vụ duy trì đã gửi. */
  readonly maintenanceReminders: number;
  /** Lời nhắc bài sắp hết hạn đã gửi. */
  readonly expiringPostReminders: number;
  /** Số lượt tìm thấy nhưng chưa gửi vì `dryRun`. */
  readonly pendingReview: number;
  readonly pendingMaintenance: number;
  readonly pendingExpiringPosts: number;
}

export interface ISendPendingRemindersUseCase extends IUseCase<
  ISendPendingRemindersCommand,
  ISendPendingRemindersResult
> {}

export const ISendPendingRemindersUseCase = Symbol(
  'ISendPendingRemindersUseCase',
);
