import {
  ICreateWantedPostBodyDto,
  ICreateWantedPostResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface ICreateWantedPostCommand extends ICreateWantedPostBodyDto {
  userId: string;
}

export interface ICreateWantedPostResult extends ICreateWantedPostResponseDto {}

export interface ICreateWantedPostUseCase extends IUseCase<
  ICreateWantedPostCommand,
  ICreateWantedPostResult
> {}

export const ICreateWantedPostUseCase = Symbol('ICreateWantedPostUseCase');
