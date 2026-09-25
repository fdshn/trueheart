import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bỏ duyệt trước khi đăng bài (chốt 26/09).
 *
 * Từ đây bài lên thẳng `PUBLISHED`. Nhưng dữ liệu cũ còn những bài đứng ở
 * `PENDING_REVIEW` từ thời còn hàng đợi duyệt — và hàng đợi đó nay không còn ai
 * mở. Không đụng tới chúng là để tác giả chờ một người kiểm duyệt sẽ không bao
 * giờ tới.
 *
 * Hạn tính từ **bây giờ**, không phải từ `created_at`: những bài này chưa từng
 * được hiện ra lần nào, nên tính ngược lại là cho một bài vừa lên đời đã sắp hết
 * hạn — hoặc hết hạn ngay trong lần quét kế tiếp.
 *
 * `enum` `gift_post_status` GIỮ NGUYÊN giá trị `PENDING_REVIEW`: cột `status` của
 * `content_comments` vẫn dùng khái niệm chờ duyệt cho bình luận bị bộ lọc từ ngữ
 * giữ lại, và `admin_audit_logs` còn ghi lại những lần duyệt cũ.
 */
export class PublishPendingPosts1793800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "posts"
      SET "status" = 'PUBLISHED',
          "expires_at" = COALESCE("expires_at", now() + interval '3 months'),
          "updated_at" = now()
      WHERE "status" = 'PENDING_REVIEW'
        AND "deleted_at" IS NULL
    `);
  }

  public async down(): Promise<void> {
    // Không quay lại được, và cố quay lại thì sai hơn là không làm gì: sau bước
    // trên, bài từng chờ duyệt lẫn hẳn vào những bài vẫn luôn PUBLISHED. Đẩy tất
    // cả về PENDING_REVIEW là gỡ xuống cả những bài chưa bao giờ chờ duyệt.
  }
}
