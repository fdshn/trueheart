/**
 * Bộ seed đầy đủ (`npm run seed:full`) trên Postgres thật.
 *
 * Bốn điều unit test mock không thấy được:
 *
 * 1. MỌI bảng nghiệp vụ có ít nhất một dòng. Bảng mới thêm mà seed chưa phủ thì đỏ ở
 *    đây — đó là cách bộ seed không mục dần như danh sách "3 bảng" của seed demo cũ.
 * 2. Chạy lần hai KHÔNG thêm dòng nào. Seed lên staging là chạy lại nhiều lần.
 * 3. Dữ liệu suy ra khớp dữ liệu gốc: số dư điểm khớp sổ, bộ đếm bài/bình luận khớp
 *    dòng, projection nhu cầu từ thiện khớp lượt giao nhận. Seed ghi lệch là API trả
 *    số sai và người test tưởng app sai.
 * 4. Seed không để lại thứ mà cron thật sẽ cầm lên chạy (broadcast chờ gửi, thông báo
 *    chưa đẩy).
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { compare } from 'bcryptjs';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { Personas } from '../src/infrastructure/persistence/seeds/full/seed-context';
import { seedFullData } from '../src/infrastructure/persistence/seeds/full/seed-full-data';
import { DemoPassword } from '../src/infrastructure/persistence/seeds/seed-demo-data';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_seed_full_check';

/** Bảng được phép trống, kèm lý do. Thêm vào đây phải có lý do, không phải để cho xanh. */
const AllowedEmpty: Record<string, string> = {
  gift_posts: 'bảng cũ đã thay bằng posts (M2.1), chỉ còn cho backfill',
};

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `${ok ? '  ✓' : '  ✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`,
  );
  if (!ok) failures.push(detail ? `${label}: ${detail}` : label);
}

async function tableCounts(
  dataSource: DataSource,
): Promise<Map<string, number>> {
  const tables = await dataSource.query<{ name: string }[]>(
    `SELECT c.relname AS name FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
       AND c.relname NOT IN ('spatial_ref_sys', 'migrations')
     ORDER BY 1`,
  );
  const counts = new Map<string, number>();
  for (const { name } of tables) {
    const [{ n }] = await dataSource.query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "${name}"`,
    );
    counts.set(name, n);
  }
  return counts;
}

async function main(): Promise<void> {
  const baseUri = process.env.DATABASE_URI;
  if (!baseUri) throw new Error('Thiếu DATABASE_URI.');

  const adminUri = baseUri.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  const scratchUri = baseUri.replace(/\/[^/?]+(\?|$)/, `/${ScratchDatabase}$1`);

  const admin = new DataSource({ type: 'postgres', url: adminUri });
  await admin.initialize();
  await admin.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
  await admin.query(`CREATE DATABASE ${ScratchDatabase}`);
  await admin.destroy();

  const dataSource = new DataSource({
    type: 'postgres',
    url: scratchUri,
    entities: resolveAllEntities(entities),
    migrations: resolveAllEntities(migrations),
    migrationsTableName: 'migrations',
  });
  await dataSource.initialize();
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  const q = <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ) => dataSource.query<T[]>(sql, params);

  try {
    await seedFullData(dataSource);
    const first = await tableCounts(dataSource);

    console.log('1. Mọi bảng nghiệp vụ đều có dữ liệu');
    const empty = [...first].filter(
      ([name, n]) => n === 0 && !(name in AllowedEmpty),
    );
    check(
      `${first.size - Object.keys(AllowedEmpty).length} bảng có dòng, chỉ ${Object.keys(AllowedEmpty).length} bảng được phép trống`,
      empty.length === 0,
      `bảng trống: ${empty.map(([name]) => name).join(', ')}`,
    );

    console.log('\n2. Chạy lại không thêm dòng nào');
    await seedFullData(dataSource);
    const second = await tableCounts(dataSource);
    const grew = [...second].filter(([name, n]) => n !== first.get(name));
    check(
      'số dòng mọi bảng giữ nguyên sau lượt seed thứ hai',
      grew.length === 0,
      grew.map(([name, n]) => `${name} ${first.get(name)}→${n}`).join(', '),
    );

    console.log('\n3. Dữ liệu suy ra khớp dữ liệu gốc');
    const ledgerDrift = await q<{ user_id: string }>(
      `SELECT b.user_id FROM user_point_balances b
       LEFT JOIN LATERAL (
         SELECT balance_after, raw_balance_after, lifetime_after FROM point_ledger
         WHERE user_id = b.user_id ORDER BY id DESC LIMIT 1
       ) last ON true
       LEFT JOIN LATERAL (
         SELECT sum(delta)::int AS raw FROM point_ledger WHERE user_id = b.user_id
       ) total ON true
       WHERE last.balance_after IS DISTINCT FROM b.balance
          OR last.raw_balance_after IS DISTINCT FROM b.raw_balance
          OR last.lifetime_after IS DISTINCT FROM b.lifetime
          OR total.raw IS DISTINCT FROM b.raw_balance`,
    );
    check(
      'số dư điểm = dòng sổ cuối = tổng delta, cho mọi người',
      ledgerDrift.length === 0,
      JSON.stringify(ledgerDrift),
    );

    const postDrift = await q(
      `SELECT p.global_id FROM posts p WHERE
         p.comment_count <> (SELECT count(*) FROM content_comments c WHERE c.subject_type = 'POST' AND c.subject_id = p.global_id AND c.status = 'VISIBLE')
      OR p.reaction_count <> (SELECT count(*) FROM content_reactions r WHERE r.subject_type = 'POST' AND r.subject_id = p.global_id)
      OR p.share_count <> (SELECT count(*) FROM content_shares s WHERE s.subject_type = 'POST' AND s.subject_id = p.global_id)`,
    );
    check(
      'bộ đếm bình luận/cảm xúc/chia sẻ của bài khớp dòng gốc (chỉ đếm VISIBLE)',
      postDrift.length === 0,
      JSON.stringify(postDrift),
    );

    const commentDrift = await q(
      `SELECT c.global_id FROM content_comments c WHERE
         c.reply_count <> (SELECT count(*) FROM content_comments x WHERE x.parent_id = c.global_id AND x.status = 'VISIBLE')
      OR c.reaction_count <> (SELECT count(*) FROM content_reactions r WHERE r.subject_type = 'COMMENT' AND r.subject_id = c.global_id)
      OR c.media_count <> (SELECT count(*) FROM content_comment_media m WHERE m.comment_id = c.global_id)`,
    );
    check(
      'bộ đếm trả lời/cảm xúc/ảnh của bình luận khớp dòng gốc',
      commentDrift.length === 0,
      JSON.stringify(commentDrift),
    );

    const chatDrift = await q(
      `SELECT m.global_id FROM chat_messages m
       WHERE m.media_count <> (SELECT count(*) FROM chat_message_media x WHERE x.message_id = m.global_id)`,
    );
    check(
      'media_count của tin nhắn khớp số ảnh',
      chatDrift.length === 0,
      JSON.stringify(chatDrift),
    );

    const needDrift = await q(
      `SELECT n.global_id, n.accepted_quantity, n.received_quantity FROM campaign_need_items n WHERE
         n.accepted_quantity <> COALESCE((SELECT sum(di.accepted_quantity) FROM campaign_delivery_items di
           JOIN campaign_deliveries d ON d.global_id = di.delivery_id
           WHERE di.need_item_id = n.global_id AND d.status = 'ACCEPTED'), 0)
      OR n.received_quantity <> COALESCE((SELECT sum(di.received_quantity) FROM campaign_delivery_items di
           JOIN campaign_deliveries d ON d.global_id = di.delivery_id
           WHERE di.need_item_id = n.global_id AND d.status = 'COMPLETED'), 0)
         + COALESCE((SELECT sum(e.quantity) FROM campaign_external_contributions e
           WHERE e.need_item_id = n.global_id AND e.status = 'ACTIVE'), 0)`,
    );
    check(
      'projection nhu cầu từ thiện khớp giao nhận + đóng góp ngoài',
      needDrift.length === 0,
      JSON.stringify(needDrift),
    );

    const overflow = await q(
      `SELECT n.global_id FROM campaign_need_items n JOIN campaigns c ON c.global_id = n.campaign_id
       WHERE NOT c.allow_over_target AND n.accepted_quantity + n.received_quantity > n.target_quantity`,
    );
    check(
      'không nhu cầu nào vượt mục tiêu khi hoạt động không cho phép',
      overflow.length === 0,
      JSON.stringify(overflow),
    );

    const deliveryDrift = await q(
      `SELECT d.global_id FROM campaign_deliveries d WHERE EXISTS (
         SELECT 1 FROM campaign_delivery_items di
         JOIN campaign_contribution_items ci ON ci.global_id = di.contribution_item_id
         WHERE di.delivery_id = d.global_id AND di.accepted_quantity <> ci.accepted_quantity)`,
    );
    check(
      'lượt giao nhận mang đúng số đã chấp nhận của đề nghị',
      deliveryDrift.length === 0,
      JSON.stringify(deliveryDrift),
    );

    const states = await q<{ state: string; n: number }>(
      `SELECT CASE
         WHEN approval_status <> 'APPROVED' THEN approval_status
         WHEN is_active THEN 'ACTIVE'
         WHEN end_time > now() THEN 'SUSPENDED'
         ELSE 'CLOSED' END AS state, count(*)::int AS n
       FROM campaigns GROUP BY 1`,
    );
    const stateSet = new Set(states.map((row) => row.state));
    check(
      'hoạt động từ thiện phủ đủ trạng thái §8 (ACTIVE, SUSPENDED, CLOSED, PENDING, REJECTED)',
      ['ACTIVE', 'SUSPENDED', 'CLOSED', 'PENDING_APPROVAL', 'REJECTED'].every(
        (state) => stateSet.has(state),
      ),
      JSON.stringify(states),
    );

    const [giver] = await q<{
      giver_rating_average: string | null;
      giver_rating_samples: number;
      giver_accuracy_percent: number | null;
    }>(
      `SELECT giver_rating_average, giver_rating_samples, giver_accuracy_percent FROM users WHERE global_id = $1`,
      [Personas.giver],
    );
    check(
      'người tặng demo đủ mẫu: điểm sao và độ chính xác ĐỀU được công bố',
      giver.giver_rating_average !== null &&
        giver.giver_accuracy_percent !== null,
      JSON.stringify(giver),
    );

    const statuses = await q<{ status: string }>(
      `SELECT DISTINCT status::text FROM posts`,
    );
    const postStatuses = new Set(statuses.map((row) => row.status));
    const [{ all }] = await q<{ all: string[] }>(
      `SELECT enum_range(NULL::gift_posts_status_enum)::text[] AS all`,
    );
    const missing = all.filter((status) => !postStatuses.has(status));
    check(
      'bài đăng phủ MỌI giá trị của gift_posts_status_enum',
      missing.length === 0,
      `thiếu ${missing.join(', ')}`,
    );

    // Đúng điều kiện `toLegacyGiftPost` đòi: một bài OFFER thiếu `condition` làm
    // `GET /gift-posts/nearby` ra 500 cho CẢ danh sách, không chỉ bài đó.
    const offersWithoutCondition = await q(
      `SELECT global_id FROM posts
       WHERE post_type = 'OFFER' AND deleted_at IS NULL
         AND NOT (details ? 'condition' AND details ? 'estimatedValue')`,
    );
    check(
      'mọi bài OFFER có condition + estimatedValue như bài tạo qua API',
      offersWithoutCondition.length === 0,
      JSON.stringify(offersWithoutCondition),
    );
    // Mã mời sai định dạng thì DTO đăng ký từ chối trước khi tới nhóm: link mời demo
    // thành link chết mà không ai đoán ra vì sao (gặp 16/10 — mã seed dài 10 ký tự).
    const badInviteCodes = await q<{ invite_code: string }>(
      `SELECT invite_code FROM groups WHERE invite_code !~ '^[A-Z0-9]{16}$'`,
    );
    check(
      'mã mời nhóm seed đúng định dạng DTO đăng ký nhận (16 ký tự A-Z0-9)',
      badInviteCodes.length === 0,
      JSON.stringify(badInviteCodes),
    );

    console.log('\n4. Không để lại việc cho cron thật');
    const [{ live }] = await q<{ live: number }>(
      `SELECT count(*)::int AS live FROM notification_broadcasts WHERE status IN ('PENDING', 'SENDING')`,
    );
    check(
      'không broadcast nào đang chờ gửi — worker sẽ gửi cho MỌI người dùng',
      live === 0,
      `${live}`,
    );
    const [{ unpushed }] = await q<{ unpushed: number }>(
      `SELECT count(*)::int AS unpushed FROM notifications WHERE pushed_at IS NULL AND idempotency_key LIKE 'SEED:%'`,
    );
    check('thông báo seed đều đã đánh dấu đẩy', unpushed === 0, `${unpushed}`);
    const [{ enabled }] = await q<{ enabled: number }>(
      `SELECT count(*)::int AS enabled FROM affiliate_policy_revisions
       WHERE version = (SELECT max(version) FROM affiliate_policy_revisions) AND enabled`,
    );
    check(
      'chính sách affiliate HIỆN HÀNH vẫn tắt — seed không bật tính năng chưa duyệt',
      enabled === 0,
    );
    const [{ active }] = await q<{ active: number }>(
      `SELECT count(*)::int AS active FROM user_sessions
       WHERE device_id LIKE 'seed-%' AND revoked_at IS NULL AND expires_at > now()`,
    );
    check(
      'không phiên đăng nhập seed nào còn dùng được',
      active === 0,
      `${active}`,
    );

    console.log('\n5. Tài khoản demo đăng nhập được');
    const [admin] = await q<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE global_id = $1`,
      [Personas.admin],
    );
    check(
      'demo-quan-tri nhận mật khẩu demo',
      await compare(DemoPassword, admin.password_hash),
    );
    const [{ roles }] = await q<{ roles: string[] }>(
      `SELECT array_agg(r.code ORDER BY r.code) AS roles FROM admin_user_roles ur
       JOIN admin_roles r ON r.id = ur.role_id WHERE ur.user_id = ANY($1::uuid[])`,
      [[Personas.admin, Personas.moderator, Personas.auditor]],
    );
    check(
      'có đủ ba vai trò Admin để test RBAC',
      ['AUDITOR', 'MODERATOR', 'SUPER_ADMIN'].every((code) =>
        roles.includes(code),
      ),
      JSON.stringify(roles),
    );
  } finally {
    await dataSource.destroy();
    const cleanup = new DataSource({ type: 'postgres', url: adminUri });
    await cleanup.initialize();
    await cleanup.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
    await cleanup.destroy();
  }

  console.log(
    `\n${failures.length === 0 ? 'Seed đầy đủ: phủ mọi bảng, idempotent, dữ liệu suy ra khớp dữ liệu gốc' : `${failures.length} phép kiểm thất bại`}`,
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
