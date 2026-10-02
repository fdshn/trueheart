import { BlogCategory } from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';

export interface IBlogSummaryView {
  id: string;
  title: string;
  slug: string;
  category: BlogCategory;
  categoryLabel: string;
  summary: string | null;
  thumbnailUrl: string | null;
  viewCount: number;
  isPublished: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBlogDetailView extends IBlogSummaryView {
  /** HTML đã lọc — thứ đang nằm trong database, không lọc lại lúc đọc. */
  contentHtml: string;
}

export interface IBlogWriteInput {
  title: string;
  /** Bỏ trống thì sinh từ tiêu đề. */
  slug?: string;
  category: BlogCategory;
  summary?: string | null;
  contentHtml?: string;
  thumbnailUrl?: string | null;
  isPublished: boolean;
}

export interface IListAdminBlogsCommand {
  actorUserId: string;
  limit: number;
  offset: number;
  category?: BlogCategory;
}

export interface IBlogListResult {
  items: IBlogSummaryView[];
  total: number;
}

export interface IListAdminBlogsUseCase extends IUseCase<
  IListAdminBlogsCommand,
  IBlogListResult
> {}

export const IListAdminBlogsUseCase = Symbol('IListAdminBlogsUseCase');

export interface ICreateBlogCommand extends IBlogWriteInput {
  actorUserId: string;
}

export interface ICreateBlogUseCase extends IUseCase<
  ICreateBlogCommand,
  IBlogDetailView
> {}

export const ICreateBlogUseCase = Symbol('ICreateBlogUseCase');

export interface IUpdateBlogCommand extends IBlogWriteInput {
  actorUserId: string;
  blogId: string;
}

export interface IUpdateBlogUseCase extends IUseCase<
  IUpdateBlogCommand,
  IBlogDetailView
> {}

export const IUpdateBlogUseCase = Symbol('IUpdateBlogUseCase');

export interface IDeleteBlogCommand {
  actorUserId: string;
  blogId: string;
}

export interface IDeleteBlogResult {
  deleted: boolean;
}

export interface IDeleteBlogUseCase extends IUseCase<
  IDeleteBlogCommand,
  IDeleteBlogResult
> {}

export const IDeleteBlogUseCase = Symbol('IDeleteBlogUseCase');

/** Công khai. */
export interface IListPublicBlogsCommand {
  limit: number;
  offset: number;
  category?: BlogCategory;
}

export interface IListPublicBlogsUseCase extends IUseCase<
  IListPublicBlogsCommand,
  IBlogListResult
> {}

export const IListPublicBlogsUseCase = Symbol('IListPublicBlogsUseCase');

export interface IGetPublicBlogCommand {
  /** `slug` hoặc `id` — SRS gọi đường này là `GET /blogs/:id`, nhưng slug mới là thứ đẹp trên link chia sẻ. */
  idOrSlug: string;
}

export interface IGetPublicBlogUseCase extends IUseCase<
  IGetPublicBlogCommand,
  IBlogDetailView
> {}

export const IGetPublicBlogUseCase = Symbol('IGetPublicBlogUseCase');
