export interface ICategoryDto {
  categoryId: string;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
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
}
export interface ICreateCategoryBodyDto {
  category: ICreateCategoryDto;
}
export interface ICreateCategoryResponseDto {
  category: ICategoryDto;
}
