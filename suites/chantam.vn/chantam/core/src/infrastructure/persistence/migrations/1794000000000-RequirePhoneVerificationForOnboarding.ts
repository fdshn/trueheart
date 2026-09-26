import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Xác minh SĐT trở thành nhiệm vụ BẮT BUỘC của onboarding (chốt 26/09).
 *
 * Trước migration này chỉ `PROFILE_COMPLETE` là bắt buộc, mà nhiệm vụ đó chỉ
 * đòi bốn trường CÓ MẶT, không đòi đúng. Nên chi phí tạo một tài khoản ảo là:
 * gõ một họ tên, một email bất kỳ qua được kiểm định dạng, một chuỗi số bất kỳ,
 * và up một ảnh. Xong là tự động nhận 224đ, lên thẳng hạng Thành viên, và kích
 * hoạt phần thưởng giới thiệu 56đ cho người mời — đường gian lận rẻ nhất trong
 * hệ thống.
 *
 * ⚠️ **Hệ quả vận hành:** onboarding nay KHÔNG hoàn tất được cho tới khi có
 * adapter SMS thật. Đó là chủ ý: thà chặn đường lên hạng còn hơn để van điểm mở
 * cho tài khoản ảo.
 *
 * Người đã xong onboarding trước đây KHÔNG bị ảnh hưởng — điểm và hạng đã trao,
 * khoá idempotency giữ cho không trao lại lần nữa.
 */
export class RequirePhoneVerificationForOnboarding1794000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "onboarding_tasks" SET "required" = true WHERE "key" = 'PHONE_VERIFIED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "onboarding_tasks" SET "required" = false WHERE "key" = 'PHONE_VERIFIED'
    `);
  }
}
