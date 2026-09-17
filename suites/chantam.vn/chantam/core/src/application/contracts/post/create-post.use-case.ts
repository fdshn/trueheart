import {
  ICreatePostBodyDto,
  ICreatePostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface ICreatePostCommand extends ICreatePostBodyDto {
  userId: string;
}

export interface ICreatePostResult extends ICreatePostResponseDto {}

export interface ICreatePostUseCase extends IUseCase<
  ICreatePostCommand,
  ICreatePostResult
> {}

export const ICreatePostUseCase = Symbol('ICreatePostUseCase');
