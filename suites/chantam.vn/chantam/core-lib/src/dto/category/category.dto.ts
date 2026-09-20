import { PostTypes } from '../../consts';

export interface ICategoryDto {
  categoryId: string;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
  /**
   * Loại bài dùng được danh mục này.
   *
   * Khi lọc cây theo `postType`, nhánh cha không khớp vẫn được giữ lại để cây
   * không đứt — client đọc trường này để biết node nào thật sự chọn được.
   */
  postTypes: PostTypes[];
  children: ICategoryDto[];
}
export interface IGetCategoryTreeResponseDto {
  categories: ICategoryDto[];
}
export interface ICreateCategoryDto {
  name: string;
  slug?: string;
  icon?: string;
  sortOrder?: number;
  parentId?: string;
  /** Bỏ trống thì danh mục dùng được cho mọi loại bài. */
  postTypes?: PostTypes[];
}
export interface ICreateCategoryBodyDto {
  category: ICreateCategoryDto;
}
export interface ICreateCategoryResponseDto {
  category: ICategoryDto;
}

export interface IUpdateCategoryDto {
  name?: string;
  slug?: string;
  icon?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  parentId?: string | null;
}
export interface IUpdateCategoryBodyDto {
  category: IUpdateCategoryDto;
}
export interface IUpdateCategoryResponseDto {
  category: ICategoryDto;
}
