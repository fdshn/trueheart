import {
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IGetMyPostsResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetMyPostsCommand {
  userId: string;
  postType?: PostTypes;
  status?: GiftPostStatuses;
  categoryId?: string;
  page?: number;
  /** Tên tham số phân trang của repo là `pageSize`, không phải `limit`. */
  pageSize?: number;
}

export interface IGetMyPostsResult extends IGetMyPostsResponseDto {}

export interface IGetMyPostsUseCase extends IUseCase<
  IGetMyPostsCommand,
  IGetMyPostsResult
> {}

export const IGetMyPostsUseCase = Symbol('IGetMyPostsUseCase');
