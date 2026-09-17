import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Danh mục nền dùng được ngay sau migrate. Đây là dữ liệu reference ổn định,
 * không phải demo staging: M2 sẽ map posts.category_id vào những slug này.
 */
export class SeedBaseCategories1789800000001 implements MigrationInterface {
  name = 'SeedBaseCategories1789800000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO categories (
        global_id, name, slug, icon, sort_order, is_active, parent_id
      ) VALUES
        ('30000000-0000-4000-8000-000000000001', 'Đồ dùng gia đình', 'do-dung-gia-dinh', 'home', 10, true, NULL),
        ('30000000-0000-4000-8000-000000000002', 'Quần áo', 'quan-ao', 'shirt', 20, true, NULL),
        ('30000000-0000-4000-8000-000000000003', 'Sách', 'sach', 'book', 30, true, NULL),
        ('30000000-0000-4000-8000-000000000004', 'Điện tử', 'dien-tu', 'cpu', 40, true, NULL),
        ('30000000-0000-4000-8000-000000000005', 'Nội thất', 'noi-that', 'armchair', 50, true, NULL),
        ('30000000-0000-4000-8000-000000000006', 'Phương tiện', 'phuong-tien', 'bike', 60, true, NULL),
        ('30000000-0000-4000-8000-000000000007', 'Y tế', 'y-te', 'heart-pulse', 70, true, NULL),
        ('30000000-0000-4000-8000-000000000008', 'Thực phẩm', 'thuc-pham', 'utensils', 80, true, NULL),
        ('30000000-0000-4000-8000-000000000009', 'Khác', 'khac', 'more-horizontal', 90, true, NULL)
      ON CONFLICT (global_id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        icon = EXCLUDED.icon,
        sort_order = EXCLUDED.sort_order,
        is_active = EXCLUDED.is_active,
        parent_id = EXCLUDED.parent_id,
        updated_at = now()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM categories
      WHERE global_id BETWEEN
        '30000000-0000-4000-8000-000000000001' AND
        '30000000-0000-4000-8000-000000000009'
    `);
  }
}
