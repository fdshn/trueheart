import {
  IDeleteGiftPostParamsDto,
  IDeleteGiftPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IDeleteGiftPostCommand extends IDeleteGiftPostParamsDto {}

export interface IDeleteGiftPostResult extends IDeleteGiftPostResponseDto {}

export interface IDeleteGiftPostUseCase extends IUseCase<
  IDeleteGiftPostCommand,
  IDeleteGiftPostResult
> {}

export const IDeleteGiftPostUseCase = Symbol('IDeleteGiftPostUseCase');
