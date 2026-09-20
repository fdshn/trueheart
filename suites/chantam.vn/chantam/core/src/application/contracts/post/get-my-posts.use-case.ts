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
  limit?: number;
}

export interface IGetMyPostsUseCase extends IUseCase<
  IGetMyPostsCommand,
  IGetMyPostsResponseDto
> {}

export const IGetMyPostsUseCase = Symbol('IGetMyPostsUseCase');
