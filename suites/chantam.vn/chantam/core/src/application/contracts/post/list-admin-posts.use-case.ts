import { IAdminPostSummary } from '@/domain/ports/repository';
import {
  GiftPostStatuses,
  PostTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IUseCase } from '@chantam/service.common-lib';
import { PaginationMetaDto } from '@chantam/service.common-lib/dto';

export interface IListAdminPostsCommand {
  actorUserId: string;
  status?: GiftPostStatuses;
  postType?: PostTypes;
  categoryId?: string;
  authorId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface IListAdminPostsResult {
  posts: IAdminPostSummary[];
  meta: PaginationMetaDto;
}

export interface IListAdminPostsUseCase extends IUseCase<
  IListAdminPostsCommand,
  IListAdminPostsResult
> {}

export const IListAdminPostsUseCase = Symbol('IListAdminPostsUseCase');
