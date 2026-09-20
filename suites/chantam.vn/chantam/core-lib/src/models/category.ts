import { PostTypes } from '../consts';

export interface ICategory {
  name: string;
  /**
   * Danh mục này dùng được cho những loại bài nào.
   *
   * Mảng chứ không phải một giá trị: "Đồ điện tử" vừa đem tặng vừa rao bán
   * được, và tách thành hai bản ghi cùng tên thì thống kê theo danh mục bị
   * chẻ đôi.
   */
  postTypes: PostTypes[];
  slug: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  parentId: string | null;
}
