import {
  IGetPostMapQueryDto,
  IGetPostMapResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetPostMapCommand extends IGetPostMapQueryDto {}

export interface IGetPostMapResult extends IGetPostMapResponseDto {}

export interface IGetPostMapUseCase extends IUseCase<
  IGetPostMapCommand,
  IGetPostMapResult
> {}

export const IGetPostMapUseCase = Symbol('IGetPostMapUseCase');
