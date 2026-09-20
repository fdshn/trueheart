import {
  IGetNearbyPostsQueryDto,
  IGetNearbyPostsResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetNearbyPostsCommand extends IGetNearbyPostsQueryDto {
  currentUserId?: string;
}

export interface IGetNearbyPostsResult extends IGetNearbyPostsResponseDto {}

export interface IGetNearbyPostsUseCase extends IUseCase<
  IGetNearbyPostsCommand,
  IGetNearbyPostsResult
> {}

export const IGetNearbyPostsUseCase = Symbol('IGetNearbyPostsUseCase');
