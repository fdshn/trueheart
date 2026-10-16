import { INotificationBroadcast } from '@/domain/ports/repository';
import { IBroadcastAudience } from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';

export interface IBroadcastView extends INotificationBroadcast {}

export interface ICreateBroadcastCommand {
  actorUserId: string;
  audience: unknown;
  title: string;
  body: string;
}

export interface ICreateBroadcastResult {
  broadcast: IBroadcastView;
}

export interface ICreateBroadcastUseCase extends IUseCase<
  ICreateBroadcastCommand,
  ICreateBroadcastResult
> {}

export const ICreateBroadcastUseCase = Symbol('ICreateBroadcastUseCase');

export interface IListBroadcastsCommand {
  actorUserId: string;
  limit: number;
  offset: number;
}

export interface IListBroadcastsResult {
  items: IBroadcastView[];
  total: number;
}

export interface IListBroadcastsUseCase extends IUseCase<
  IListBroadcastsCommand,
  IListBroadcastsResult
> {}

export const IListBroadcastsUseCase = Symbol('IListBroadcastsUseCase');

/**
 * Chạy bằng CLI (cron), hoặc nền sau `POST .../broadcasts/:id/send` — không bao giờ
 * đồng bộ trong một request HTTP, vì nó có thể mất vài phút.
 */
export interface IProcessBroadcastCommand {
  /**
   * Lượt gửi ĐÃ được nhận (đã giữ lease) — "Gửi ngay" nhận đồng bộ để trả 409
   * ngay khi có người khác đang gửi, rồi mới giao phần chạy xuống đây.
   */
  readonly claimed?: INotificationBroadcast;
  readonly dryRun?: boolean;
  readonly batchSize?: number;
}

export interface IProcessBroadcastResult {
  /** `null` khi không có lượt gửi nào còn dở. */
  readonly broadcastId: string | null;
  readonly audienceLabel: string | null;
  readonly audience: IBroadcastAudience | null;
  readonly processed: number;
  readonly notified: number;
  readonly alreadySent: number;
  readonly failed: number;
  /** `true` khi lượt gửi này đã xong hẳn trong lượt chạy vừa rồi. */
  readonly completed: boolean;
}

export interface IProcessBroadcastUseCase extends IUseCase<
  IProcessBroadcastCommand,
  IProcessBroadcastResult
> {}

export const IProcessBroadcastUseCase = Symbol('IProcessBroadcastUseCase');

export interface ISendBroadcastNowCommand {
  actorUserId: string;
  broadcastId: string;
}

export interface ISendBroadcastNowResult {
  /** Trạng thái ngay sau khi nhận — `SENDING`. Tiến độ xem qua `GET .../broadcasts`. */
  broadcast: IBroadcastView;
}

export interface ISendBroadcastNowUseCase extends IUseCase<
  ISendBroadcastNowCommand,
  ISendBroadcastNowResult
> {}

export const ISendBroadcastNowUseCase = Symbol('ISendBroadcastNowUseCase');
