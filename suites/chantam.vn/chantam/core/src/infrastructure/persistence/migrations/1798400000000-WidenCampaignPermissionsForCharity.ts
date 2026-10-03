import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nới nghĩa `campaign.read` / `campaign.manage` để trùm luôn Hoạt động Từ thiện (F65).
 *
 * ## Vì sao dùng lại hai quyền cũ, không sinh cặp `charity.*`
 *
 * Vai `CAMPAIGN_MANAGER` (migration `1798000000000`) tên là "Quản lý chiến dịch và nội
 * dung" và đang giữ đúng hai quyền này. Sinh thêm `charity.read` / `charity.approve` là
 * phải cấp lại cho ba vai, và để ngỏ khả năng quên một vai — trong khi `campaigns` là đúng
 * cái bảng mà "chiến dịch" trỏ tới.
 *
 * Giá phải trả, ghi ra để không ai phát hiện muộn: `POLICY_ADMIN` cũng đang giữ
 * `campaign.manage`, nên từ migration này họ duyệt được hồ sơ hoạt động do thành viên gửi.
 * Chấp nhận được — cả hai vai đều là quản trị viên nội bộ do Bên A chỉ định, và lượt duyệt
 * nào cũng ghi `approved_by`.
 *
 * Migration này KHÔNG thêm quyền, chỉ sửa phần mô tả. Mô tả cũ nói "bố cục Home", và một
 * màn phân quyền nói sai phạm vi của một ô tick là cách để Bên A cấp quyền mà không biết
 * mình vừa cấp gì.
 */
export class WidenCampaignPermissionsForCharity1798400000000 implements MigrationInterface {
  name = 'WidenCampaignPermissionsForCharity1798400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE admin_permissions
         SET description = 'Xem chiến dịch, bố cục Home và hồ sơ Hoạt động Từ thiện'
       WHERE code = 'campaign.read'
    `);
    await queryRunner.query(`
      UPDATE admin_permissions
         SET description = 'Tạo/sửa chiến dịch Home động và duyệt Hoạt động Từ thiện'
       WHERE code = 'campaign.manage'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE admin_permissions
         SET description = 'Xem cấu hình chiến dịch và bố cục Home'
       WHERE code = 'campaign.read'
    `);
    await queryRunner.query(`
      UPDATE admin_permissions
         SET description = 'Tạo, sửa và kích hoạt chiến dịch Home động'
       WHERE code = 'campaign.manage'
    `);
  }
}
