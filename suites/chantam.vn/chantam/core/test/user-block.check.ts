/**
 * Chặn người dùng trên Postgres THẬT.
 *
 * - Chặn hai lần ra một dòng, giữ mốc chặn gốc.
 * - Bỏ chặn trả đúng có/không (DELETE … RETURNING qua `updateReturning`).
 * - Kiểm hiệu lực xét HAI chiều; lọc quan hệ chặn trên một danh sách ứng viên.
 * - Database tự chặn "chặn chính mình".
 *
 *   npm run test:user-block
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { UserBlockRepository } from '../src/infrastructure/repository/user-block.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_user_block_check';
const [A, B, C, D] = ['01', '02', '03', '04'].map(
  (tail) => `7f100000-0000-4000-8000-0000000000${tail}`,
);

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
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    const sql = (query: string, params: unknown[] = []) =>
      dataSource.query(query, params);
    for (const [id, username] of [
      [A, 'ub_a'],
      [B, 'ub_b'],
      [C, 'ub_c'],
      [D, 'ub_d'],
    ])
      await sql(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, username],
      );
    const blocks = new UserBlockRepository(dataSource.manager);

    console.log('1. Chặn và bỏ chặn');
    const first = await blocks.block({ blockerId: A, blockedId: B });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const again = await blocks.block({ blockerId: A, blockedId: B });
    const [rows] = await sql(
      `SELECT count(*)::int AS n FROM user_blocks WHERE blocker_id = $1`,
      [A],
    );
    check(
      'chặn hai lần: một dòng, lần sau created=false và giữ mốc gốc',
      first.created &&
        !again.created &&
        rows.n === 1 &&
        again.blockedAt.getTime() === first.blockedAt.getTime(),
    );
    check(
      'bỏ chặn: true lần đầu, false khi vốn không chặn',
      (await blocks.unblock({ blockerId: A, blockedId: B })) === true &&
        (await blocks.unblock({ blockerId: A, blockedId: B })) === false,
    );

    console.log('\n2. Hiệu lực hai chiều');
    await blocks.block({ blockerId: A, blockedId: B });
    await blocks.block({ blockerId: C, blockedId: A });
    check(
      'A chặn B: cả A→B lẫn B→A đều bị chặn; A–D thì không',
      (await blocks.isBlockedEitherWay(A, B)) &&
        (await blocks.isBlockedEitherWay(B, A)) &&
        !(await blocks.isBlockedEitherWay(A, D)),
    );
    const related = await blocks.filterBlockRelations(A, [B, C, D]);
    check(
      'lọc ứng viên của A: B (A chặn) và C (chặn A), không có D',
      [...related].sort().join(',') === [B, C].sort().join(','),
      [...related].join(','),
    );

    console.log('\n3. Danh sách của chính người chặn');
    await new Promise((resolve) => setTimeout(resolve, 20));
    await blocks.block({ blockerId: A, blockedId: D });
    const page = await blocks.listBlocked({ blockerId: A, skip: 0, take: 1 });
    check(
      'mới chặn trước, có tổng, có username — chỉ người A chặn (không có C)',
      page.total === 2 &&
        page.items.length === 1 &&
        page.items[0].userId === D &&
        page.items[0].username === 'ub_d',
      JSON.stringify(page),
    );
    check(
      'findBlocked trả người bị chặn, null khi không chặn',
      (await blocks.findBlocked({ blockerId: A, blockedId: D }))?.username ===
        'ub_d' &&
        (await blocks.findBlocked({ blockerId: B, blockedId: A })) === null,
    );

    console.log('\n4. Ràng buộc');
    let selfRejected = false;
    try {
      await sql(
        `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $1)`,
        [A],
      );
    } catch (error) {
      selfRejected = (error as { code?: string }).code === '23514';
    }
    check('database từ chối chặn chính mình', selfRejected);
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
    const cleanup = new DataSource({ type: 'postgres', url: adminUri });
    await cleanup.initialize();
    await cleanup.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
    await cleanup.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Chặn người dùng: một dòng mỗi cặp, hiệu lực hai chiều, danh sách đúng của người chặn'
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
