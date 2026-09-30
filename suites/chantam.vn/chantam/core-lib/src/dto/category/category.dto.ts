import { PostTypes } from '../../consts';

export interface ICategoryDto {
  categoryId: string;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  /**
   * Loại bài dùng được danh mục này.
   *
   * Khi lọc cây theo `postType`, nhánh cha không khớp vẫn được giữ lại để cây
   * không đứt — client đọc trường này để biết node nào thật sự chọn được.
   */
  postTypes: PostTypes[];
  children: ICategoryDto[];
  /**
   * `false` khi chính nó bật nhưng một TỔ TIÊN đã tắt.
   *
   * Có trường này vì trước 30/09 Admin thấy `isActive: true` cho một danh mục mà
   * người dùng hoàn toàn không thấy: `findActiveTree` chỉ lấy dòng active, nên một
   * con đang bật dưới một cha đã tắt không gắn được vào đâu và biến mất khỏi cây
   * công khai. Admin không có tín hiệu nào về việc đó.
   *
   * Chỉ có nghĩa ở đường Admin (`includeInactive`); đường công khai không trả về
   * danh mục nào mà nó `false`.
   */
  effectivelyActive?: boolean;
  /**
   * `true` khi nút này KHÔNG nối được về gốc — nhánh của nó có vòng `parent_id`.
   *
   * Cây dựng từ gốc đi xuống, nên một nhánh có vòng thì không nút nào của nó còn là
   * gốc và cả nhánh biến mất khỏi cả hai đường đọc. `UpdateCategoryUseCase` nay chặn
   * việc TẠO vòng, nhưng dữ liệu cũ có thể đã có — và nếu Admin không thấy được nút
   * nào thì không có cách nào sửa qua API, chỉ còn SQL tay.
   *
   * Nên đường Admin trả những nút đó ra ở mức gốc với cờ này bật.
   */
  orphaned?: boolean;
  /**
   * Danh mục này đã được gộp vào đâu, `null` nếu chưa gộp.
   *
   * Trả ra vì nếu không, cột `merged_into_id` chỉ tồn tại trong database và không
   * ai trả lời được câu mà nó sinh ra để trả lời: "danh mục này tắt vì đã gộp, hay
   * vì Admin tắt tay". Hai câu đó dẫn tới hai hành động khác nhau.
   */
  mergedInto?: { categoryId: string; reason: string | null } | null;
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
