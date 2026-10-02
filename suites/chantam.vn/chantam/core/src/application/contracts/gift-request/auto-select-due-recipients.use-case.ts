import { IUseCase } from '@chantam/service.common-lib/use-case';

export interface IAutoSelectDueRecipientsCommand {
  readonly dryRun?: boolean;
  readonly limit?: number;
}

export interface IAutoSelectedRecipient {
  readonly postId: string;
  readonly requesterId: string;
  readonly transactionId: string | null;
  /** Số ứng viên đã cân nhắc, để log nói được "chọn 1 trong 7". */
  readonly candidates: number;
}

export interface IAutoSelectDueRecipientsResult {
  /** Bài hết đồng hồ mà chưa chốt ai. */
  readonly due: number;
  readonly selected: IAutoSelectedRecipient[];
  /** Bài bỏ qua vì lỗi — không dừng cả vòng vì một bài hỏng. */
  readonly failed: { postId: string; reason: string }[];
  /**
   * `true` khi Admin đã TẮT `allocation.policy.autoCreateTransaction` (mục mở L23).
   *
   * Phải là một trường riêng, không được để lẫn với `selected: []`: hai thứ đó nghĩa khác
   * nhau hoàn toàn — một là "Admin chủ ý dừng", một là "không có bài nào tới hạn". Người
   * đọc log cron cần phân biệt được, nếu không một lượt tắt có chủ ý trông y như một job
   * chạy không.
   */
  readonly skippedByPolicy: boolean;
}

export interface IAutoSelectDueRecipientsUseCase extends IUseCase<
  IAutoSelectDueRecipientsCommand,
  IAutoSelectDueRecipientsResult
> {}

export const IAutoSelectDueRecipientsUseCase = Symbol(
  'IAutoSelectDueRecipientsUseCase',
);
