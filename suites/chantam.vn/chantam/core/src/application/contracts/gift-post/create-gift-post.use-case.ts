import {
  ICreateGiftPostBodyDto,
  ICreateGiftPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface ICreateGiftPostCommand extends ICreateGiftPostBodyDto {}

export interface ICreateGiftPostResult extends ICreateGiftPostResponseDto {}

export interface ICreateGiftPostUseCase extends IUseCase<
  ICreateGiftPostCommand,
  ICreateGiftPostResult
> {}

export const ICreateGiftPostUseCase = Symbol('ICreateGiftPostUseCase');
