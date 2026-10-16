import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Banner tài trợ nhận cả `givingapp://` lẫn `chantam://` (CMS B7, 16/10/2026).
 *
 * Chiến dịch Home dùng `givingapp://`, banner dùng `chantam://`, và mobile chưa chốt tên
 * nào. Server nhận cả hai cho tới khi chốt — xem `AppDeepLinkSchemes` ở core-lib, nơi
 * DUY NHẤT khác giữ danh sách này. Vẫn so khớp ĐẦU chuỗi như CHECK cũ, nên
 * `javascript:` vẫn bị chặn ở lớp cuối.
 */
export class AllowBothDeepLinkSchemesOnBanners1800800000000 implements MigrationInterface {
  name = 'AllowBothDeepLinkSchemesOnBanners1800800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sponsor_banners"
      DROP CONSTRAINT "CHK_sponsor_banners_target_url",
      ADD CONSTRAINT "CHK_sponsor_banners_target_url" CHECK (
        "target_url" LIKE 'https://%'
        OR "target_url" LIKE 'chantam://%'
        OR "target_url" LIKE 'givingapp://%'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // NOT VALID: banner đã lưu bằng `givingapp://` trong lúc migration này chạy vẫn
    // nằm đó. Kiểm lại dữ liệu cũ khi rollback là làm rollback thất bại đúng lúc cần
    // nó nhất; ràng buộc vẫn chặn mọi dòng GHI MỚI.
    await queryRunner.query(`
      ALTER TABLE "sponsor_banners"
      DROP CONSTRAINT "CHK_sponsor_banners_target_url",
      ADD CONSTRAINT "CHK_sponsor_banners_target_url" CHECK (
        "target_url" LIKE 'https://%' OR "target_url" LIKE 'chantam://%'
      ) NOT VALID
    `);
  }
}
