import {
  IResolvePostShareParamsDto,
  IResolvePostShareResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IResolvePostShareCommand extends IResolvePostShareParamsDto {
  currentUserId?: string;
}

export interface IResolvePostShareResult extends IResolvePostShareResponseDto {}

export interface IResolvePostShareUseCase extends IUseCase<
  IResolvePostShareCommand,
  IResolvePostShareResult
> {}

export const IResolvePostShareUseCase = Symbol('IResolvePostShareUseCase');
