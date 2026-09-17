import {
  IModeratePostBodyDto,
  IModeratePostParamsDto,
  IModeratePostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IModeratePostCommand
  extends IModeratePostParamsDto, IModeratePostBodyDto {
  username: string;
}

export interface IModeratePostResult extends IModeratePostResponseDto {}

export interface IModeratePostUseCase extends IUseCase<
  IModeratePostCommand,
  IModeratePostResult
> {}

export const IModeratePostUseCase = Symbol('IModeratePostUseCase');
