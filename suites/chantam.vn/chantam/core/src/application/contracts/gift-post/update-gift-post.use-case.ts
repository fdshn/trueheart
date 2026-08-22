import {
  IUpdateGiftPostBodyDto,
  IUpdateGiftPostParamsDto,
  IUpdateGiftPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IUpdateGiftPostCommand
  extends IUpdateGiftPostBodyDto, IUpdateGiftPostParamsDto {}

export interface IUpdateGiftPostResult extends IUpdateGiftPostResponseDto {}

export interface IUpdateGiftPostUseCase extends IUseCase<
  IUpdateGiftPostCommand,
  IUpdateGiftPostResult
> {}

export const IUpdateGiftPostUseCase = Symbol('IUpdateGiftPostUseCase');
