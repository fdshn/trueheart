import {
  INotificationChannelSummary,
  NotificationChannelCodes,
} from '@/domain/ports/repository';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetNotificationChannelsCommand {
  actorUserId: string;
}
export interface IGetNotificationChannelsResult {
  channels: INotificationChannelSummary[];
}
export interface IGetNotificationChannelsUseCase extends IUseCase<
  IGetNotificationChannelsCommand,
  IGetNotificationChannelsResult
> {}
export const IGetNotificationChannelsUseCase = Symbol(
  'IGetNotificationChannelsUseCase',
);

export interface IUpdateNotificationChannelDto {
  provider?: string;
  enabled?: boolean;
  fromAddress?: string | null;
  fromName?: string | null;
  host?: string | null;
  port?: number | null;
  username?: string | null;
  /** Bản rõ chỉ đi vào. Bỏ trống giữ nguyên, `null` xoá secret. */
  secret?: string | null;
  reason: string;
}

export interface IUpdateNotificationChannelUseCaseCommand {
  actorUserId: string;
  channel: NotificationChannelCodes;
  channelConfig: IUpdateNotificationChannelDto;
}
export interface IUpdateNotificationChannelResult {
  channel: INotificationChannelSummary;
}
export interface IUpdateNotificationChannelUseCase extends IUseCase<
  IUpdateNotificationChannelUseCaseCommand,
  IUpdateNotificationChannelResult
> {}
export const IUpdateNotificationChannelUseCase = Symbol(
  'IUpdateNotificationChannelUseCase',
);
