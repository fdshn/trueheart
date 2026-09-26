import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nắn `users.phone` về E.164.
 *
 * Index UNIQUE trên cột này so CHUỖI. `0912345678` và `+84912345678` là cùng
 * một SIM mà khác chuỗi, nên cả hai cùng lọt — và cùng một SIM xác minh được
 * hai tài khoản, ăn thưởng hai lần. Bảng `verified_phones` dựng ngay sau đây
 * dựa vào việc mọi số đã ở cùng một dạng, nếu không thì nó khoá được đúng một
 * cách gõ.
 *
 * NÉM khi phát hiện hai tài khoản trỏ về cùng một số sau khi nắn. Gộp hay bỏ
 * bên nào là quyết định của con người, không phải của migration — và im lặng
 * chọn một bên là xoá số điện thoại của một người thật.
 */
export class NormalizePhoneNumbers1794100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const clashes = (await queryRunner.query(`
      WITH normalized AS (
        SELECT global_id,
               CASE
                 WHEN phone LIKE '+%' THEN phone
                 WHEN phone LIKE '0%' THEN '+84' || substring(phone from 2)
                 WHEN phone LIKE '84%' THEN '+' || phone
                 ELSE '+84' || phone
               END AS normalized
        FROM users
        WHERE phone IS NOT NULL AND deleted_at IS NULL
      )
      SELECT normalized FROM normalized
      GROUP BY normalized HAVING count(*) > 1
    `)) as { normalized: string }[];

    if (clashes.length > 0)
      throw new Error(
        `Có ${clashes.length} số điện thoại trùng nhau sau khi nắn về E.164: ` +
          `${clashes.map((row) => row.normalized).join(', ')}. ` +
          'Hai tài khoản đang dùng chung một SIM ở hai cách gõ. Xử lý tay rồi chạy lại.',
      );

    await queryRunner.query(`
      UPDATE users
      SET phone = CASE
            WHEN phone LIKE '+%' THEN phone
            WHEN phone LIKE '0%' THEN '+84' || substring(phone from 2)
            WHEN phone LIKE '84%' THEN '+' || phone
            ELSE '+84' || phone
          END
      WHERE phone IS NOT NULL AND phone NOT LIKE '+%'
    `);
  }

  public async down(): Promise<void> {
    // Không quay lại được: sau khi nắn, không còn dấu vết số nào vốn gõ kiểu
    // nội địa và số nào vốn đã ở E.164. Đưa tất cả về `0...` sẽ hỏng số nước
    // ngoài.
  }
}
