/**
 * Kiểm đồng hồ chọn người nhận trên Postgres THẬT (F75).
 *
 * Năm thứ unit test mock không thấy được:
 *
 * 1. `findPostsDueForSelection` lọc đúng: chỉ bài còn PUBLISHED, còn ứng viên,
 *    và đã hết đồng hồ.
 * 2. `listCandidateMetrics` tra đúng cột cho cả năm tiêu chí của CH-1 — nhất là
 *    `ST_Distance` và hai phép đếm lịch sử.
 * 3. Người chưa đặt vị trí ra `distanceMeters = null`, KHÔNG phải 0 mét.
 * 4. Duyệt xong thì `selection_deadline` bị xoá, nên vòng sau không nhặt lại.
 * 5. Thứ tự Admin cấu hình thật sự đổi được người thắng.
 */
import { CandidateSelectionCriteria } from '@chantam.vn/chantam.core-lib/consts';
import { pickNextCandidate } from '@chantam.vn/chantam.core-lib/models';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { GiftRequestRepository } from '../src/infrastructure/repository/gift-request.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_selection_check';
const CategoryId = '30000000-0000-4000-8000-0000000e0001';
const GiverId = '99999999-9999-4999-8999-9999999e1001';
const PostId = '88888888-8888-4888-8888-8888888e1001';

/** Ba ứng viên, mỗi người mạnh ở một tiêu chí khác nhau. */
const Early = '99999999-9999-4999-8999-9999999e2001';
const Nearby = '99999999-9999-4999-8999-9999999e2002';
const HighRank = '99999999-9999-4999-8999-9999999e2003';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function main(): Promise<void> {
  const baseUri = process.env.DATABASE_URI;
  if (!baseUri) throw new Error('Thiếu DATABASE_URI.');

  const adminUri = baseUri.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  const scratchUri = baseUri.replace(/\/[^/?]+(\?|$)/, `/${ScratchDatabase}$1`);

  const opened: DataSource[] = [];
  const admin = new DataSource({ type: 'postgres', url: adminUri });
  await admin.initialize();
  opened.push(admin);
  await admin.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
  await admin.query(`CREATE DATABASE ${ScratchDatabase}`);

  const dataSource = new DataSource({
    type: 'postgres',
    url: scratchUri,
    entities: resolveAllEntities(entities),
    migrations: resolveAllEntities(migrations),
    migrationsTableName: 'migrations',
    extra: { max: 10 },
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  const requests = new GiftRequestRepository(
    entities.GiftRequestEntity as never,
    dataSource.manager,
    {
      openRoomWithinTransaction: async () => undefined,
      lockRoomWithinTransaction: async () => undefined,
    } as never,
  );

  try {
    await dataSource.query(
      `INSERT INTO categories (global_id, name, slug, is_active)
       VALUES ($1, 'Kiểm chọn', 'kiem-chon', true)`,
      [CategoryId],
    );

    // Bài ở toạ độ Quận 1. Ứng viên "gần" đặt vị trí ngay cạnh; hai người kia xa.
    await dataSource.query(
      `INSERT INTO users (global_id, username, email, password_hash, rank, status)
       VALUES ($1, 'nguoi-tang-chon', 'nguoi-tang-chon@chantam.test', 'x', 'GOLD', 'ACTIVE')`,
      [GiverId],
    );
    for (const [id, name, rank, lng, lat] of [
      [Early, 'xin-som', 'MEMBER', 106.75, 10.82],
      [Nearby, 'o-gan', 'MEMBER', 106.6981, 10.7725],
      [HighRank, 'hang-cao', 'DIAMOND', null, null],
    ] as const)
      await dataSource.query(
        `INSERT INTO users
           (global_id, username, email, password_hash, rank, status, default_location)
         VALUES ($1, $2, $3, 'x', $4, 'ACTIVE',
                 CASE WHEN $5::float8 IS NULL THEN NULL
                      ELSE ST_SetSRID(ST_MakePoint($5::float8, $6::float8), 4326)::geography
                 END)`,
        [id, name, `${name}@chantam.test`, rank, lng, lat],
      );

    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count, selection_mode, selection_deadline)
       VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm chọn người nhận',
               'Mô tả đủ dài cho bài kiểm đồng hồ chọn',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'PUBLISHED', 1, 1, '{}'::jsonb, 0, 'OPTIMAL',
               now() - interval '1 hour')`,
      [PostId, GiverId, CategoryId],
    );

    let seq = 0;
    for (const [id, joinedDaysAgo] of [
      [Early, 6],
      [Nearby, 3],
      [HighRank, 1],
    ] as const) {
      seq += 1;
      await dataSource.query(
        `INSERT INTO gift_requests
           (global_id, post_id, requester_id, message, status, queue_joined_at)
         VALUES ($1, $2, $3, 'Em xin ạ', 'PENDING',
                 now() - ($4 || ' days')::interval)`,
        [
          `77777777-7777-4777-8777-77777770000${seq}`,
          PostId,
          id,
          String(joinedDaysAgo),
        ],
      );
    }

    console.log('1. findPostsDueForSelection lọc đúng');
    const due = await requests.findPostsDueForSelection(10);
    check(
      'bài hết đồng hồ có trong danh sách',
      due.length === 1,
      `${due.length}`,
    );
    check(
      'kèm giverId để biết duyệt thay ai',
      due[0]?.giverId === GiverId,
      due[0]?.giverId,
    );

    // Bài chưa tới hạn → KHÔNG được có.
    await dataSource.query(
      `UPDATE posts SET selection_deadline = now() + interval '3 days'
       WHERE global_id = $1`,
      [PostId],
    );
    check(
      'bài chưa hết đồng hồ thì KHÔNG có',
      (await requests.findPostsDueForSelection(10)).length === 0,
    );
    await dataSource.query(
      `UPDATE posts SET selection_deadline = now() - interval '1 hour'
       WHERE global_id = $1`,
      [PostId],
    );

    console.log('\n2. listCandidateMetrics tra đủ năm tiêu chí');
    const metrics = await requests.listCandidateMetrics(PostId);
    check('đủ ba ứng viên', metrics.length === 3, `${metrics.length}`);

    const near = metrics.find((row) => row.requesterId === Nearby);
    const high = metrics.find((row) => row.requesterId === HighRank);
    const early = metrics.find((row) => row.requesterId === Early);

    check(
      'kèm global_id của YÊU CẦU, không phải id người',
      typeof early?.requestGlobalId === 'string' &&
        early.requestGlobalId !== early.requesterId,
      early?.requestGlobalId,
    );
    check('đọc đúng rank', high?.rank === 'DIAMOND', high?.rank);
    check(
      'ST_Distance đo được, người ở gần dưới 200m',
      (near?.distanceMeters ?? Infinity) < 200,
      `${near?.distanceMeters}m`,
    );
    check(
      'người xa hơn thì khoảng cách lớn hơn',
      (early?.distanceMeters ?? 0) > (near?.distanceMeters ?? 0),
      `${early?.distanceMeters}m vs ${near?.distanceMeters}m`,
    );
    check(
      'chưa đặt vị trí → null, KHÔNG phải 0 mét',
      high?.distanceMeters === null,
      `${high?.distanceMeters}`,
    );
    check(
      'đếm lịch sử nhận và huỷ, mặc định 0',
      early?.receivedCount === 0 && early?.cancellationCount === 0,
    );

    console.log('\n3. Thứ tự Admin cấu hình đổi được người thắng');
    const byDefault = pickNextCandidate(metrics, null);
    check(
      'mặc định chọn người xin TRƯỚC',
      byDefault?.requesterId === Early,
      byDefault?.requesterId,
    );

    const byRank = pickNextCandidate(metrics, [
      CandidateSelectionCriteria.HIGHEST_RANK,
    ]);
    check(
      'xếp theo hạng thì Kim Cương thắng dù xin sau',
      byRank?.requesterId === HighRank,
      byRank?.requesterId,
    );

    const byDistance = pickNextCandidate(metrics, [
      CandidateSelectionCriteria.NEAREST,
    ]);
    check(
      'xếp theo khoảng cách thì người ở gần thắng',
      byDistance?.requesterId === Nearby,
      byDistance?.requesterId,
    );

    console.log('\n4. Duyệt xong thì xoá đồng hồ');
    const winner = metrics.find((row) => row.requesterId === Early);
    await requests.acceptRequest({
      requestId: winner!.requestGlobalId,
      postId: PostId,
      giverId: GiverId,
      transactionId: '66666666-6666-4666-8666-666666660001',
    });

    const [post] = await dataSource.query<
      { selection_deadline: Date | null; status: string }[]
    >(`SELECT selection_deadline, status FROM posts WHERE global_id = $1`, [
      PostId,
    ]);
    check(
      'selection_deadline đã xoá',
      post?.selection_deadline === null,
      `${post?.selection_deadline}`,
    );
    check(
      'nên vòng quét sau KHÔNG nhặt lại bài đã có chủ',
      (await requests.findPostsDueForSelection(10)).length === 0,
    );

    console.log('\n5. Ứng viên còn lại vào hàng đợi dự phòng');
    const [standby] = await dataSource.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM gift_requests
       WHERE post_id = $1 AND status = 'STANDBY'`,
      [PostId],
    );
    check(
      'hai người còn lại thành STANDBY, không phải REJECTED',
      Number(standby?.total) === 2,
      `${standby?.total} người`,
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Đồng hồ chọn người nhận: lọc đúng, đo đúng, và không chọn lại bài đã có chủ'
        : `${failures.length} phép kiểm thất bại`
    }`,
  );
  if (failures.length > 0) {
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
