import { ICategoryEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Repository } from 'typeorm';

export interface ICategoryRepository extends Repository<ICategoryEntity> {
  findActiveTree(): Promise<ICategoryEntity[]>;
  findAdminTree(): Promise<ICategoryEntity[]>;
  isSlugTaken(slug: string, exceptCategoryId: string): Promise<boolean>;

  /**
   * Id của danh mục và TOÀN BỘ nhánh con.
   *
   * Cần vì mọi chỗ lọc bài trước 30/09 dùng `category_id = :id` PHẲNG, nên lọc theo
   * một danh mục cha trả về 0 bài — đúng thứ mà [22 §22.1](../../../../../../docs/diagram/22-category.md)
   * nói phải làm được.
   */
  findSubtreeIds(categoryId: string): Promise<string[]>;

  /** Chính nó và toàn bộ tổ tiên, từ dưới lên gốc. Dùng để chặn vòng và kiểm tổ tiên đã tắt. */
  findAncestorChain(
    categoryId: string,
  ): Promise<{ categoryId: string; isActive: boolean }[]>;

  /** Số bài đang dùng danh mục này hoặc bất kỳ nhánh con của nó. */
  countPostsInSubtree(categoryId: string): Promise<number>;

  /**
   * Chuyển bài và con sang danh mục đích rồi TẮT nguồn, trong một transaction.
   *
   * Nguồn chỉ bị tắt, không xoá — bài cũ vẫn cần đọc được tên để hiển thị lịch sử,
   * cùng lý do §22.2 chọn tắt thay vì xoá. `merged_into_id` ghi nó đã đi đâu.
   */
  mergeInto(params: {
    sourceId: string;
    targetId: string;
    reason: string;
  }): Promise<{ movedPosts: number; movedChildren: number }>;

  /** Độ sâu lớn nhất tính từ gốc nếu treo `categoryId` dưới `parentId`. */
  measureDepthAfterMove(
    categoryId: string | null,
    parentId: string | null,
  ): Promise<number>;
}

export const ICategoryRepository = Symbol('ICategoryRepository');
