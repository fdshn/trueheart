import {
  IGetMyPostsQueryDto,
  IGetMyPostsResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetMyPostsCommand extends IGetMyPostsQueryDto {
  userId: string;
}

export interface IGetMyPostsResult extends IGetMyPostsResponseDto {}

export interface IGetMyPostsUseCase
  extends IUseCase<IGetMyPostsCommand, IGetMyPostsResult> {}

export const IGetMyPostsUseCase = Symbol('IGetMyPostsUseCase');
