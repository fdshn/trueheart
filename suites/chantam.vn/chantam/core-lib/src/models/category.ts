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
  /**
   * Danh mục này đã được GỘP vào danh mục nào, nếu có.
   *
   * Phân biệt hai lý do một danh mục đang tắt, và hai lý do đó dẫn tới hai hành
   * động khác nhau: tắt tay thì bật lại được, còn đã gộp thì bật lại là tạo ra hai
   * danh mục trùng nghĩa lần nữa — nên đường bật lại bị chặn.
   */
  mergedIntoId: string | null;
  /** Vì sao gộp. Ba tháng sau không ai nhớ, và audit log chỉ tra được nếu có ghi. */
  mergeReason: string | null;
}
