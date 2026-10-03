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

/** Chạy bằng CLI — không có endpoint, vì nó có thể mất vài phút. */
export interface IProcessBroadcastCommand {
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
