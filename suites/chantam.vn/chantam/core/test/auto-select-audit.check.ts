/**
 * Job tự chọn người nhận trên Postgres THẬT (PR #46 §9): chạy lặp và chạy song song.
 *
 * Mỗi vòng dựng một bài tới hạn với ba ứng viên, rồi cho HAI lượt job chạy cùng lúc trên hai
 * kết nối riêng của pool — chúng tranh nhau khoá hàng thật. Sau mỗi vòng:
 *
 * - đúng MỘT lượt trao, MỘT phòng chat, MỘT thông báo, MỘT dòng audit cho bài;
 * - lượt thua không bị tính là lỗi;
 * - dòng audit nêu đúng người thắng, người về nhì và tiêu chí mà hàm thuần tính ra;
 * - chạy thêm lần nữa thì không còn bài tới hạn.
 *
 *   npm run test:auto-select-audit
 */
import { explainCandidateSelection } from '@chantam.vn/chantam.core-lib/models';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import { AutoSelectDueRecipientsUseCase } from '../src/application/implementations/gift-request/auto-select-due-recipients.use-case';
import * as entities from '../src/infrastructure/entity';
import { GiftRequestEntity } from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { ChatRepository } from '../src/infrastructure/repository/chat.repository';
import { GiftRequestRepository } from '../src/infrastructure/repository/gift-request.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_auto_select_audit_check';
const Rounds = 10;
const CategoryId = '30000000-0000-4000-8000-0000000a0001';
const GiverId = '7d100000-0000-4000-8000-000000000001';
const Candidates = [
  ['7d100000-0000-4000-8000-000000000002', 'as_som', 'MEMBER', 106.75, 10.82],
  [
    '7d100000-0000-4000-8000-000000000003',
    'as_gan',
    'MEMBER',
    106.6981,
    10.7725,
  ],
  [
    '7d100000-0000-4000-8000-000000000004',
    'as_kim_cuong',
    'DIAMOND',
    null,
    null,
  ],
] as const;

const postId = (round: number) =>
  `7d200000-0000-4000-8000-${String(round).padStart(12, '0')}`;
const requestId = (round: number, index: number) =>
  `7d300000-0000-4000-8000-${String(round * 10 + index).padStart(12, '0')}`;

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
    // Nhiều kết nối là điều kiện cần để hai lượt job thật sự chạy song song.
    extra: { max: 10 },
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    const sql = (query: string, params: unknown[] = []) =>
      dataSource.query(query, params);
    await sql(
      `INSERT INTO categories (global_id, name, slug, is_active)
       VALUES ($1, 'Kiểm tự chọn', 'kiem-tu-chon', true)`,
      [CategoryId],
    );
    await sql(
      `INSERT INTO users (global_id, username, email, password_hash, rank, status)
       VALUES ($1, 'as_nguoi_tang', 'as_nguoi_tang@chantam.test', 'x', 'GOLD', 'ACTIVE')`,
      [GiverId],
    );
    for (const [id, name, rank, lng, lat] of Candidates)
      await sql(
        `INSERT INTO users
           (global_id, username, email, password_hash, rank, status, default_location)
         VALUES ($1, $2, $3, 'x', $4, 'ACTIVE',
                 CASE WHEN $5::float8 IS NULL THEN NULL
                      ELSE ST_SetSRID(ST_MakePoint($5::float8, $6::float8), 4326)::geography
                 END)`,
        [id, name, `${name}@chantam.test`, rank, lng, lat],
      );

    const adminConfig = new AdminConfigRepository(dataSource.manager);
    const requests = new GiftRequestRepository(
      GiftRequestEntity as never,
      dataSource.manager,
      new ChatRepository(dataSource.manager, adminConfig),
      new PointLedgerRepository(dataSource.manager),
    );
    const announced: string[] = [];
    const job = new AutoSelectDueRecipientsUseCase(requests, adminConfig, {
      announce: async (params: { postId: string }) => {
        announced.push(params.postId);
      },
    } as never);

    let duplicateRounds = 0;
    let failedRuns = 0;
    let auditMismatches: string[] = [];
    for (let round = 1; round <= Rounds; round += 1) {
      const post = postId(round);
      await sql(
        `INSERT INTO posts
           (global_id, post_type, author_id, category_id, title, description,
            location, area_label, status, total_quantity, remaining_quantity,
            details, renewed_count, selection_mode, selection_deadline)
         VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm tự chọn', 'Mô tả đủ dài cho bài kiểm tự chọn',
                 ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
                 'Quận 1', 'PUBLISHED', 1, 1, '{"condition":"USED"}'::jsonb, 0, 'OPTIMAL',
                 now() - interval '1 hour')`,
        [post, GiverId, CategoryId],
      );
      for (const [index, [requester]] of Candidates.entries())
        await sql(
          `INSERT INTO gift_requests
             (global_id, post_id, requester_id, message, status, queue_joined_at)
           VALUES ($1, $2, $3, 'Em xin ạ', 'PENDING',
                   now() - make_interval(days => $4::int))`,
          [requestId(round, index), post, requester, 6 - index * 2],
        );

      const expected = explainCandidateSelection(
        await requests.listCandidateMetrics(post),
        (await adminConfig.getConfigValue('selection.candidate_priority')) as
          readonly unknown[] | null,
      );

      const runs = await Promise.all([job.handle({}), job.handle({})]);
      failedRuns += runs.filter((run) => run.failed.length > 0).length;

      const [counts] = await sql(
        `SELECT
           (SELECT count(*)::int FROM gift_transactions WHERE post_id = $1) AS transactions,
           (SELECT count(*)::int FROM chat_rooms WHERE post_id = $1) AS rooms,
           (SELECT count(*)::int FROM recipient_selection_audits WHERE post_id = $1) AS audits,
           (SELECT remaining_quantity FROM posts WHERE global_id = $1) AS remaining`,
        [post],
      );
      const announcements = announced.filter((id) => id === post).length;
      if (
        counts.transactions !== 1 ||
        counts.rooms !== 1 ||
        counts.audits !== 1 ||
        counts.remaining !== 0 ||
        announcements !== 1
      )
        duplicateRounds += 1;

      const [audit] = await sql(
        `SELECT audit.requester_id, audit.deciding_criterion, audit.candidate_count,
                audit.criteria_order, audit.winner_metrics, audit.runner_up_metrics,
                deal.receiver_id
           FROM recipient_selection_audits audit
           JOIN gift_transactions deal ON deal.global_id = audit.transaction_id
          WHERE audit.post_id = $1`,
        [post],
      );
      const matches =
        audit &&
        expected &&
        audit.requester_id === expected.winner.requesterId &&
        audit.receiver_id === expected.winner.requesterId &&
        audit.deciding_criterion === expected.decidingCriterion &&
        audit.candidate_count === Candidates.length &&
        audit.winner_metrics.requesterId === expected.winner.requesterId &&
        audit.runner_up_metrics?.requesterId ===
          expected.runnerUp?.requesterId &&
        JSON.stringify(audit.criteria_order) === JSON.stringify(expected.order);
      if (!matches)
        auditMismatches = [
          ...auditMismatches,
          `vòng ${round}: ${JSON.stringify(audit)}`,
        ];
    }

    console.log(`1. ${Rounds} vòng, mỗi vòng hai lượt job song song`);
    check(
      'mỗi bài đúng một lượt trao, một phòng chat, một thông báo, một audit; tồn kho về 0',
      duplicateRounds === 0,
      `${duplicateRounds} vòng lệch`,
    );
    check(
      'lượt thua cuộc tranh khoá không bị tính là lỗi',
      failedRuns === 0,
      `${failedRuns} lượt có failed`,
    );
    check(
      'audit nêu đúng người thắng, người về nhì, tiêu chí và thứ tự tiêu chí',
      auditMismatches.length === 0,
      auditMismatches[0] ?? '',
    );

    console.log('\n2. Chạy lặp');
    const again = await job.handle({});
    check(
      'chạy thêm lần nữa: không còn bài tới hạn, không lượt trao mới',
      again.due === 0 && again.selected.length === 0,
      JSON.stringify(again),
    );
    const [totals] = await sql(
      `SELECT (SELECT count(*)::int FROM gift_transactions) AS transactions,
              (SELECT count(*)::int FROM recipient_selection_audits) AS audits`,
    );
    check(
      `tổng cộng ${Rounds} lượt trao và ${Rounds} dòng audit`,
      totals.transactions === Rounds && totals.audits === Rounds,
      JSON.stringify(totals),
    );

    console.log('\n3. Người xin không hợp lệ không được chọn');
    const [banned, suspended, expired] = [
      '7d100000-0000-4000-8000-000000000011',
      '7d100000-0000-4000-8000-000000000012',
      '7d100000-0000-4000-8000-000000000013',
    ];
    for (const [id, name, status, until] of [
      [banned, 'as_bi_khoa', 'BANNED', null],
      [suspended, 'as_dang_treo', 'SUSPENDED', `now() + interval '3 days'`],
      [expired, 'as_het_treo', 'SUSPENDED', `now() - interval '1 day'`],
    ] as const)
      await sql(
        `INSERT INTO users (global_id, username, email, password_hash, rank, status, suspended_until)
         VALUES ($1, $2, $3, 'x', 'MEMBER', $4, ${until ?? 'NULL'})`,
        [id, name, `${name}@chantam.test`, status],
      );
    const onlyLocked = postId(91);
    const mixed = postId(92);
    for (const post of [onlyLocked, mixed])
      await sql(
        `INSERT INTO posts
           (global_id, post_type, author_id, category_id, title, description,
            location, area_label, status, total_quantity, remaining_quantity,
            details, renewed_count, selection_mode, selection_deadline)
         VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm người xin bị khoá', 'Mô tả đủ dài cho bài kiểm người xin bị khoá',
                 ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
                 'Quận 1', 'PUBLISHED', 1, 1, '{"condition":"USED"}'::jsonb, 0, 'OPTIMAL',
                 now() - interval '1 hour')`,
        [post, GiverId, CategoryId],
      );
    // Bài 91 chỉ có người bị khoá và người đang trong hạn treo. Bài 92 có thêm người đã HẾT
    // hạn treo, xin muộn nhất — vẫn phải là người được chọn.
    for (const [index, [post, requester, daysAgo]] of [
      [onlyLocked, banned, 9],
      [onlyLocked, suspended, 8],
      [mixed, banned, 9],
      [mixed, suspended, 8],
      [mixed, expired, 1],
    ].entries())
      await sql(
        `INSERT INTO gift_requests
           (global_id, post_id, requester_id, message, status, queue_joined_at)
         VALUES ($1, $2, $3, 'Em xin ạ', 'PENDING', now() - make_interval(days => $4::int))`,
        [requestId(90, index), post, requester, daysAgo],
      );
    const dueIds = (await requests.findPostsDueForSelection(50)).map(
      (row) => row.postId,
    );
    check(
      'bài chỉ còn người bị khoá/đang treo không nằm trong vòng quét',
      !dueIds.includes(onlyLocked) && dueIds.includes(mixed),
      JSON.stringify(dueIds),
    );
    const mixedCandidates = (await requests.listCandidateMetrics(mixed)).map(
      (row) => row.requesterId,
    );
    check(
      'ứng viên chỉ gồm người đã hết hạn treo',
      JSON.stringify(mixedCandidates) === JSON.stringify([expired]),
      JSON.stringify(mixedCandidates),
    );
    await job.handle({});
    const [mixedDeal] = await sql(
      `SELECT receiver_id FROM gift_transactions WHERE post_id = $1`,
      [mixed],
    );
    check(
      'job trao cho người hợp lệ dù họ xin muộn nhất',
      mixedDeal?.receiver_id === expired,
      JSON.stringify(mixedDeal),
    );

    console.log('\n4. Ràng buộc bảng audit');
    let constraintHeld = false;
    try {
      await sql(
        `UPDATE recipient_selection_audits SET runner_up_metrics = NULL
          WHERE post_id = $1`,
        [postId(1)],
      );
    } catch (error) {
      constraintHeld = (error as { code?: string }).code === '23514';
    }
    check(
      'có người về nhì thì phải có số đo người về nhì (CHECK)',
      constraintHeld,
    );
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
        ? 'Tự chọn người nhận: chạy song song/lặp không tạo trùng, mỗi lượt trao tự chọn có đúng một dòng lý do'
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
