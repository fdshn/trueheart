import { MigrationInterface, QueryRunner } from 'typeorm';

const Previous = ['HOME_HERO', 'HOME_INLINE', 'POST_LIST', 'MERIT_PAGE'];

/**
 * Tám vị trí banner mới (PR #46 §13): bốn tab Khám phá và bốn màn Phật Pháp.
 *
 * Danh sách phải khớp `BannerPlacements` ở core-lib — `test:banner` so hai bên. Viết cứng ở
 * đây chứ không import: migration là ảnh chụp lịch sử, mai này hằng số đổi thì migration cũ
 * không được đổi theo.
 */
const Next = [
  ...Previous,
  'DISCOVERY_GIVING',
  'DISCOVERY_REQUEST',
  'DISCOVERY_CHARITY',
  'DISCOVERY_CLASSIFIED',
  'DHARMA_HOME',
  'DHARMA_CHANTING',
  'DHARMA_FORUM',
  'DHARMA_MONASTERY',
];

const checkOf = (placements: string[]) =>
  `CHECK ("placement" IN (${placements.map((value) => `'${value}'`).join(', ')}))`;

export class AddBannerPlacements1801900000000 implements MigrationInterface {
  name = 'AddBannerPlacements1801900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sponsor_banners" DROP CONSTRAINT "CHK_sponsor_banners_placement"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sponsor_banners" ADD CONSTRAINT "CHK_sponsor_banners_placement" ${checkOf(Next)}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Banner đã đặt ở vị trí mới sẽ làm CHECK cũ thất bại — để Postgres từ chối thay vì xoá
    // âm thầm dữ liệu đối tác đã trả tiền.
    await queryRunner.query(
      `ALTER TABLE "sponsor_banners" DROP CONSTRAINT "CHK_sponsor_banners_placement"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sponsor_banners" ADD CONSTRAINT "CHK_sponsor_banners_placement" ${checkOf(Previous)}`,
    );
  }
}
