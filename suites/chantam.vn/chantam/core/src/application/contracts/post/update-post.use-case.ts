import {
  IUpdatePostBodyDto,
  IUpdatePostParamsDto,
  IUpdatePostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IUpdatePostCommand
  extends IUpdatePostParamsDto, IUpdatePostBodyDto {
  userId: string;
}

export interface IUpdatePostResult extends IUpdatePostResponseDto {}

export interface IUpdatePostUseCase extends IUseCase<
  IUpdatePostCommand,
  IUpdatePostResult
> {}

export const IUpdatePostUseCase = Symbol('IUpdatePostUseCase');
