import {
  IRefreshSessionBodyDto,
  IRefreshSessionResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IRefreshSessionCommand extends IRefreshSessionBodyDto {}
export interface IRefreshSessionResult extends IRefreshSessionResponseDto {}

export interface IRefreshSessionUseCase extends IUseCase<
  IRefreshSessionCommand,
  IRefreshSessionResult
> {}

export const IRefreshSessionUseCase = Symbol('IRefreshSessionUseCase');
