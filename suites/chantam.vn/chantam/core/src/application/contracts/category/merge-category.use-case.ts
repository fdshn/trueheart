import { ICategoryDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IMergeCategoryCommand {
  readonly userId: string;
  /** Danh mục bị gộp ĐI. Sau khi gộp nó bị tắt, không bị xoá. */
  readonly categoryId: string;
  readonly merge: {
    /** Danh mục nhận bài. */
    readonly targetCategoryId: string;
    readonly reason: string;
  };
}

export interface IMergeCategoryResult {
  /** Danh mục nhận, sau khi gộp. */
  readonly category: ICategoryDto;
  readonly movedPosts: number;
  readonly movedChildren: number;
}

export interface IMergeCategoryUseCase extends IUseCase<
  IMergeCategoryCommand,
  IMergeCategoryResult
> {}
export const IMergeCategoryUseCase = Symbol('IMergeCategoryUseCase');
