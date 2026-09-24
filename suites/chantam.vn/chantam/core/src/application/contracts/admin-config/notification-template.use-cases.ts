import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  IListNotificationTemplatesResponseDto,
  IUpdateNotificationTemplateBodyDto,
  IUpdateNotificationTemplateResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IListNotificationTemplatesCommand {
  actorUserId: string;
}

export type IListNotificationTemplatesResult =
  IListNotificationTemplatesResponseDto;

export interface IListNotificationTemplatesUseCase extends IUseCase<
  IListNotificationTemplatesCommand,
  IListNotificationTemplatesResult
> {}

export const IListNotificationTemplatesUseCase = Symbol(
  'IListNotificationTemplatesUseCase',
);

export interface IUpdateNotificationTemplateCommand extends IUpdateNotificationTemplateBodyDto {
  actorUserId: string;
  type: NotificationTypes;
}

export type IUpdateNotificationTemplateResult =
  IUpdateNotificationTemplateResponseDto;

export interface IUpdateNotificationTemplateUseCase extends IUseCase<
  IUpdateNotificationTemplateCommand,
  IUpdateNotificationTemplateResult
> {}

export const IUpdateNotificationTemplateUseCase = Symbol(
  'IUpdateNotificationTemplateUseCase',
);
