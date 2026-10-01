import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bản chính sách đã đóng khung thời gian thì phải mang `ARCHIVED`, 01/10.
 *
 * Đường publish trước 01/10 đóng bản cũ bằng cách đặt `effective_to` nhưng giữ nguyên
 * `status = 'PUBLISHED'`. Các đường đọc vẫn đúng vì chúng lọc cả khung thời gian, nên
 * không gì đổ — nhưng cột `status` thì nói sai: sau N lượt publish có N dòng đều ghi
 * `PUBLISHED` và chỉ một dòng thật sự đang chạy.
 *
 * Nó nằm im được vì không ai đọc cột đó. `GET /admin/entitlements/history` (thêm cùng
 * ngày) trả chính cột đó ra cho Admin, nên một cột nói sai thành một câu trả lời sai.
 *
 * Chỉ sửa những dòng ĐÃ đóng: `effective_to IS NOT NULL`. Dòng đang mở giữ `PUBLISHED`.
 */
export class ArchiveClosedEntitlementRevisions1796900000000 implements MigrationInterface {
  name = 'ArchiveClosedEntitlementRevisions1796900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "config_revisions"
      SET "status" = 'ARCHIVED'
      WHERE "status" = 'PUBLISHED'
        AND "effective_to" IS NOT NULL
    `);
  }

  public async down(): Promise<void> {
    // Không đảo: đưa một bản đã đóng về `PUBLISHED` là dựng lại đúng trạng thái
    // sai mà migration này dọn, và với ràng buộc GIST thì nó còn có thể đụng
    // nhau nếu hai bản cùng quay lại.
  }
}
