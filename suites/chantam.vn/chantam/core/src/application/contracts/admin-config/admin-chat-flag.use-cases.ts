import { IChatMessageFlagItem } from '@/domain/ports/repository';
import { IUseCase } from '@chantam/service.common-lib';
import { IPaginationMetaDto } from '@chantam/service.common-lib/dto';

export interface IGetChatFlagQueueCommand {
  readonly actorUserId: string;
  readonly page?: number;
  /** Tên `pageSize` chứ không `limit`: `toSkipTake` của common-lib đọc khoá đó,
   * và mọi endpoint Admin khác đã theo cùng quy ước. */
  readonly pageSize?: number;
}

export interface IGetChatFlagQueueResult {
  readonly flags: IChatMessageFlagItem[];
  readonly meta: IPaginationMetaDto;
}

export interface IGetChatFlagQueueUseCase extends IUseCase<
  IGetChatFlagQueueCommand,
  IGetChatFlagQueueResult
> {}
export const IGetChatFlagQueueUseCase = Symbol('IGetChatFlagQueueUseCase');

export interface IGetChatFlagPendingCountCommand {
  readonly actorUserId: string;
}
export interface IGetChatFlagPendingCountResult {
  readonly pending: number;
}
export interface IGetChatFlagPendingCountUseCase extends IUseCase<
  IGetChatFlagPendingCountCommand,
  IGetChatFlagPendingCountResult
> {}
export const IGetChatFlagPendingCountUseCase = Symbol(
  'IGetChatFlagPendingCountUseCase',
);

/**
 * Quyết định của Admin cho một cờ.
 *
 * `MESSAGE_REMOVED` KHÔNG tự gỡ tin nhắn — gỡ đi qua
 * `DELETE /admin/chat/messages/:messageId`, nơi đã có trigger và audit riêng.
 * Ở đây nó chỉ GHI LẠI rằng đó là quyết định, vì hai việc có hai hệ quả khác nhau
 * và gộp lại thì một lượt gỡ thất bại sẽ để lại cờ nói "đã gỡ".
 */
export const ChatFlagActions = [
  'DISMISSED',
  'MESSAGE_REMOVED',
  'USER_WARNED',
] as const;
export type ChatFlagAction = (typeof ChatFlagActions)[number];

export interface IReviewChatFlagCommand {
  readonly actorUserId: string;
  readonly flagId: string;
  readonly review: {
    readonly action: ChatFlagAction;
    readonly note?: string;
  };
}
export interface IReviewChatFlagResult extends IGetChatFlagQueueResult {}
export interface IReviewChatFlagUseCase extends IUseCase<
  IReviewChatFlagCommand,
  IReviewChatFlagResult
> {}
export const IReviewChatFlagUseCase = Symbol('IReviewChatFlagUseCase');
