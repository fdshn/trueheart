import {
  IGetPostParamsDto,
  IGetPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetPostCommand extends IGetPostParamsDto {}

export interface IGetPostResult extends IGetPostResponseDto {}

export interface IGetPostUseCase extends IUseCase<
  IGetPostCommand,
  IGetPostResult
> {}

export const IGetPostUseCase = Symbol('IGetPostUseCase');
