import {
  IGetNearbyGiftPostsQueryDto,
  IGetNearbyGiftPostsResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetNearbyGiftPostsCommand extends IGetNearbyGiftPostsQueryDto {}

export interface IGetNearbyGiftPostsResult extends IGetNearbyGiftPostsResponseDto {}

export interface IGetNearbyGiftPostsUseCase extends IUseCase<
  IGetNearbyGiftPostsCommand,
  IGetNearbyGiftPostsResult
> {}

export const IGetNearbyGiftPostsUseCase = Symbol('IGetNearbyGiftPostsUseCase');
