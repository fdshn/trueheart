import {
  IListNotificationsQueryDto,
  IListNotificationsResponseDto,
  IMarkNotificationsReadBodyDto,
  IMarkNotificationsReadResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IListNotificationsCommand extends IListNotificationsQueryDto {
  userId: string;
}

export interface IListNotificationsResult extends IListNotificationsResponseDto {}

export interface IListNotificationsUseCase extends IUseCase<
  IListNotificationsCommand,
  IListNotificationsResult
> {}

export const IListNotificationsUseCase = Symbol('IListNotificationsUseCase');

export interface IMarkNotificationsReadCommand extends IMarkNotificationsReadBodyDto {
  userId: string;
}

export interface IMarkNotificationsReadResult extends IMarkNotificationsReadResponseDto {}

export interface IMarkNotificationsReadUseCase extends IUseCase<
  IMarkNotificationsReadCommand,
  IMarkNotificationsReadResult
> {}

export const IMarkNotificationsReadUseCase = Symbol(
  'IMarkNotificationsReadUseCase',
);
