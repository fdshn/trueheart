import { PostTypes } from '@chantam.vn/chantam.core-lib/consts';
import { INearbyPostDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';
import { IPaginationMetaDto } from '@chantam/service.common-lib/dto';

export interface IListUserPostsCommand {
  username: string;
  /** `null` = khách chưa đăng nhập. */
  viewerId: string | null;
  postType?: PostTypes;
  status?: string;
  page?: number;
  pageSize?: number;
}

/** Bài trên hồ sơ — cùng hình dạng bảng tin "quanh đây", không có khoảng cách. */
export interface IListUserPostsResult {
  posts: INearbyPostDto[];
  meta: IPaginationMetaDto;
}

export interface IListUserPostsUseCase extends IUseCase<
  IListUserPostsCommand,
  IListUserPostsResult
> {}

export const IListUserPostsUseCase = Symbol('IListUserPostsUseCase');
