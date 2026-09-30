import { ICategoryRepository } from '@/domain/ports/repository';
import { ICategoryEntity } from '@chantam.vn/chantam.core-lib/entities';
import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, EntitySchema, Repository } from 'typeorm';
@Injectable()
export class CategoryRepository
  extends Repository<ICategoryEntity>
  implements ICategoryRepository
{
  constructor(
    @Inject(ICategoryEntity) target: EntitySchema,
    @InjectEntityManager() manager: EntityManager,
  ) {
    super(target, manager);
  }
  async isSlugTaken(slug: string, exceptCategoryId: string): Promise<boolean> {
    return (
      (await this.createQueryBuilder('category')
        .where('category.slug = :slug', { slug })
        .andWhere('category.globalId != :exceptCategoryId', {
          exceptCategoryId,
        })
        .getCount()) > 0
    );
  }

  async findActiveTree() {
    return this.createQueryBuilder('category')
      .where('category.isActive = true')
      .orderBy('category.sortOrder', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .getMany();
  }

  async findAdminTree() {
    return this.createQueryBuilder('category')
      .orderBy('category.sortOrder', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .getMany();
  }

  /**
   * Id của danh mục và TOÀN BỘ nhánh con của nó.
   *
   * `WITH RECURSIVE` chứ không đệ quy ở TypeScript: đệ quy ngoài database cần một
   * lượt truy vấn cho mỗi tầng, và số lượt phụ thuộc dữ liệu nên không đo được.
   *
   * `UNION` (không `ALL`) là hàng rào chống VÒNG: nó bỏ id đã thấy, nên một vòng
   * trong cây làm câu này dừng thay vì chạy mãi. Dữ liệu cũ có thể đã có vòng từ
   * trước khi `UpdateCategoryUseCase` biết chặn, nên câu đọc phải tự đứng được.
   */
  async findSubtreeIds(categoryId: string): Promise<string[]> {
    const rows = await this.manager.query<{ global_id: string }[]>(
      `
        WITH RECURSIVE subtree AS (
          SELECT global_id FROM categories WHERE global_id = $1
          UNION
          SELECT child.global_id
          FROM categories child
          INNER JOIN subtree ON child.parent_id = subtree.global_id
        )
        SELECT global_id FROM subtree
      `,
      [categoryId],
    );

    return rows.map((row) => row.global_id);
  }

  /**
   * Id của danh mục và toàn bộ TỔ TIÊN của nó, từ chính nó đi lên gốc.
   *
   * Dùng để chặn vòng (cha mới không được nằm trong nhánh con) và để biết một danh
   * mục có tổ tiên nào đang tắt hay không — `create-post` cần điều đó, vì một danh
   * mục active dưới một cha đã tắt thì vô hình trên cây nhưng vẫn gán được qua API.
   */
  async findAncestorChain(
    categoryId: string,
  ): Promise<{ categoryId: string; isActive: boolean }[]> {
    const rows = await this.manager.query<
      { global_id: string; is_active: boolean }[]
    >(
      `
        WITH RECURSIVE chain AS (
          SELECT global_id, parent_id, is_active, 0 AS depth
          FROM categories WHERE global_id = $1
          UNION
          SELECT parent.global_id, parent.parent_id, parent.is_active,
                 chain.depth + 1
          FROM categories parent
          INNER JOIN chain ON chain.parent_id = parent.global_id
        )
        SELECT global_id, is_active FROM chain ORDER BY depth ASC
      `,
      [categoryId],
    );

    return rows.map((row) => ({
      categoryId: row.global_id,
      isActive: row.is_active,
    }));
  }

  /**
   * Số bài đang dùng danh mục này HOẶC bất kỳ nhánh con của nó.
   *
   * Tính cả nhánh con vì tắt một danh mục cha làm cả nhánh biến mất khỏi bộ lọc —
   * bài ở nút lá cũng mất chỗ hiện, dù `category_id` của nó không trỏ vào cha.
   */
  async countPostsInSubtree(categoryId: string): Promise<number> {
    const [row] = await this.manager.query<{ total: string }[]>(
      `
        WITH RECURSIVE subtree AS (
          SELECT global_id FROM categories WHERE global_id = $1
          UNION
          SELECT child.global_id
          FROM categories child
          INNER JOIN subtree ON child.parent_id = subtree.global_id
        )
        SELECT count(*)::text AS total
        FROM posts
        WHERE posts.category_id IN (SELECT global_id FROM subtree)
          AND posts.deleted_at IS NULL
      `,
      [categoryId],
    );

    return Number(row?.total ?? 0);
  }

  /**
   * Chuyển bài và con sang danh mục đích, rồi TẮT nguồn — trong MỘT transaction.
   *
   * Tách ba câu ra thì một lần chết giữa chừng để lại nguồn đã tắt mà bài vẫn ở đó,
   * tức đúng cái §22.2 gọi là "3.000 bài biến mất khỏi bộ lọc mà không ai báo trước",
   * lần này do chính đường gộp gây ra.
   *
   * Thứ tự bắt buộc: chuyển TRƯỚC, tắt SAU. Tắt trước thì giữa hai câu có một khoảng
   * danh mục đã tắt mà bài chưa chuyển.
   */
  async mergeInto(params: {
    sourceId: string;
    targetId: string;
    reason: string;
  }): Promise<{ movedPosts: number; movedChildren: number }> {
    return this.manager.transaction(async (manager) => {
      const posts = await manager.query<unknown>(
        `UPDATE posts SET category_id = $2, updated_at = now()
         WHERE category_id = $1 AND deleted_at IS NULL`,
        [params.sourceId, params.targetId],
      );
      const children = await manager.query<unknown>(
        `UPDATE categories SET parent_id = $2, updated_at = now()
         WHERE parent_id = $1`,
        [params.sourceId, params.targetId],
      );

      // `is_active = false` cùng lúc với `merged_into_id`:
      // `CHK_categories_merged_is_inactive` đòi hai thứ đó đi cùng nhau, nên ghi
      // tách ra là vi phạm ràng buộc giữa hai câu.
      await manager.query(
        `UPDATE categories
         SET merged_into_id = $2, merge_reason = $3, is_active = false,
             updated_at = now()
         WHERE global_id = $1`,
        [params.sourceId, params.targetId, params.reason],
      );

      // TypeORM bọc UPDATE thành `[rows, affected]`; phần tử thứ hai là số dòng.
      return {
        movedPosts: Number((posts as [unknown[], number])[1] ?? 0),
        movedChildren: Number((children as [unknown[], number])[1] ?? 0),
      };
    });
  }

  /**
   * Độ sâu lớn nhất của nhánh nếu treo nó dưới `parentId`.
   *
   * Trả về số tầng TÍNH TỪ GỐC, nên nút gốc là 1. Cần cả hai chiều: chuỗi tổ tiên
   * của cha mới (nhánh sẽ nằm sâu bao nhiêu) và chiều sâu của chính nhánh đang
   * chuyển — chuyển một nhánh ba tầng xuống dưới một nút đã ở tầng ba là ra sáu.
   */
  async measureDepthAfterMove(
    categoryId: string | null,
    parentId: string | null,
  ): Promise<number> {
    const above = parentId
      ? (await this.findAncestorChain(parentId)).length
      : 0;
    if (!categoryId) return above + 1;

    const [row] = await this.manager.query<{ depth: string }[]>(
      `
        WITH RECURSIVE subtree AS (
          SELECT global_id, 1 AS depth FROM categories WHERE global_id = $1
          UNION
          SELECT child.global_id, subtree.depth + 1
          FROM categories child
          INNER JOIN subtree ON child.parent_id = subtree.global_id
        )
        SELECT COALESCE(MAX(depth), 1)::text AS depth FROM subtree
      `,
      [categoryId],
    );

    return above + Number(row?.depth ?? 1);
  }
}
