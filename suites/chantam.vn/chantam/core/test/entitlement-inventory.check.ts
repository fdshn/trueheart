/**
 * Mọi capability trong bản chính sách đang hiệu lực phải CÓ AI ĐỌC.
 *
 * ## Vì sao cần một phép kiểm riêng
 *
 * Cùng bệnh mà `test:config-inventory` sinh ra để chữa, ở một bảng khác. Một capability
 * seed đủ năm bậc mà không đường nào đọc thì **không gì đổ**: Admin mở trang quyền ra,
 * sửa được, bấm Lưu được, audit ghi lại tử tế — và không có gì thay đổi. Kiểu hỏng đó
 * tệ hơn một khoá chưa seed, vì chưa seed thì Admin không thấy ô nào.
 *
 * Soát ngày 01/10 tìm ra **hai** capability như vậy trong chín: `SELECT_REQUESTER`
 * (hạn mức 1/3/5/10 theo bậc) và `SUBMIT_CHARITY_PROPOSAL`.
 *
 * ## Và chiều ngược lại
 *
 * Một mã code ĐỌC mà database không có dòng thì `getCapability` trả `null`, và mọi chỗ
 * gọi đều đọc `null` thành "không được phép" — tức tính năng im lặng tắt. Nhóm 2 dưới
 * đây hỏi câu đó.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { CapabilityKindByCode } from '@chantam.vn/chantam.core-lib/models';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_entitlement_inventory';

/**
 * Capability mà code THẬT SỰ đọc, kèm chỗ đọc.
 *
 * Danh sách viết tay có chủ ý — cùng lối `RequiredKeys` của `config-inventory`. Dò bằng
 * grep thì một hằng trung gian (`ReactContentCapability`) làm phép dò trượt, và một
 * phép kiểm trượt im lặng còn tệ hơn không có.
 */
const ReadCapabilities: readonly { code: string; readAt: string }[] = [
  { code: 'POST_OPEN', readAt: 'create-post / renew-post' },
  { code: 'POST_SOS', readAt: 'create-post / update-post' },
  { code: 'OPEN_REQUEST_QUOTA', readAt: 'create-gift-request' },
  { code: 'DISCOVERY_RADIUS', readAt: 'get-nearby-posts' },
  { code: 'CREATE_GROUP', readAt: 'group.use-cases' },
  { code: 'REACT_CONTENT', readAt: 'content-reaction.use-cases' },
  { code: 'COMMENT_CONTENT', readAt: 'content-comment.use-cases' },
];

/**
 * Capability KHAI mà chưa ai đọc, kèm lý do — phải nêu tên ở đây mới không bị báo đỏ.
 *
 * Khác `ReadCapabilities` ở chỗ: những mã này là NỢ đã biết, không phải tính năng chạy.
 * Ghi ra để lần soát sau không ai đọc chúng thành "đã hoạt động".
 */
const DeclaredButUnread: readonly { code: string; reason: string }[] = [
  {
    code: 'SELECT_REQUESTER',
    reason:
      'Hạn mức 1/3/5/10 theo bậc nhưng không ai đọc, nên không ai biết đơn vị của nó là gì — mỗi bài được chọn mấy người, hay mỗi ngày? Nối nó đòi chốt nghiệp vụ trước, và đoán sai thì đặt một trần người dùng không hiểu',
  },
  {
    code: 'SUBMIT_CHARITY_PROPOSAL',
    reason:
      'Dành cho F65 (quản lý Từ thiện/Quảng cáo/Công đức) — phân hệ đó chưa có dòng code nào, xem 16-admin. Giữ dòng cấu hình để khi làm thì cổng quyền đã sẵn',
  },
];

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
    const rows = await dataSource.query<
      { code: string; ranks: string; enabled: boolean }[]
    >(`
      SELECT policy.code, policy.enabled, count(rank_value.id)::text AS ranks
      FROM config_revisions revision
      INNER JOIN capability_policies policy ON policy.revision_id = revision.id
      LEFT JOIN capability_rank_values rank_value ON rank_value.policy_id = policy.id
      WHERE revision.scope = 'ENTITLEMENT'
        AND revision.status = 'PUBLISHED'
        AND revision.effective_from <= now()
        AND (revision.effective_to IS NULL OR revision.effective_to > now())
      GROUP BY policy.code, policy.enabled
      ORDER BY policy.code
    `);
    const seeded = rows.map((row) => row.code);
    const read = ReadCapabilities.map((entry) => entry.code);
    const knownUnread = DeclaredButUnread.map((entry) => entry.code);

    console.log(`1. Mọi capability trong database phải được KHAI ở một trong hai danh sách`);
    for (const code of seeded)
      check(
        `${code} có mặt trong danh sách`,
        read.includes(code) || knownUnread.includes(code),
        read.includes(code)
          ? ''
          : knownUnread.includes(code)
            ? 'nợ đã biết'
            : 'KHÔNG khai ở đâu — thêm vào ReadCapabilities nếu code đọc nó, hoặc vào DeclaredButUnread kèm lý do',
      );

    console.log('\n2. Mọi capability code ĐỌC phải có dòng trong database');
    for (const entry of ReadCapabilities)
      check(
        `${entry.code} có dòng (đọc ở ${entry.readAt})`,
        seeded.includes(entry.code),
        seeded.includes(entry.code)
          ? ''
          : 'thiếu dòng → getCapability trả null → mọi chỗ gọi đọc thành "không được phép", tức tính năng im lặng tắt',
      );

    console.log('\n3. Mọi capability phải khai LOẠI ở CapabilityKindByCode');
    for (const code of seeded)
      check(
        `${code} khai loại`,
        CapabilityKindByCode[code] !== undefined,
        CapabilityKindByCode[code] ??
          'thiếu → lùi về VALUE, nên nếu nó thật sự là QUOTA thì used/remaining im lặng biến thành null',
      );

    console.log('\n4. Mọi capability phải có đủ năm bậc');
    for (const row of rows)
      check(
        `${row.code} có 5 bậc`,
        Number(row.ranks) === 5,
        `${row.ranks} bậc`,
      );

    console.log('\n5. Đúng MỘT bản đang PUBLISHED');
    // Đường publish trước 01/10 đóng bản cũ bằng `effective_to` mà giữ nguyên
    // `PUBLISHED`, nên cột `status` nói sai — và `GET /admin/entitlements/history` trả
    // chính cột đó. Ràng buộc GIST chỉ cấm trùng KHUNG THỜI GIAN nên nó không bắt được ca
    // này; phép kiểm này bắt.
    const [published] = await dataSource.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM config_revisions
       WHERE scope = 'ENTITLEMENT' AND status = 'PUBLISHED'`,
    );
    check(
      'chỉ một bản mang PUBLISHED',
      published.total === '1',
      `${published.total} bản`,
    );
    const [closedButPublished] = await dataSource.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM config_revisions
       WHERE scope = 'ENTITLEMENT' AND status = 'PUBLISHED'
         AND effective_to IS NOT NULL`,
    );
    check(
      'không bản nào vừa đóng khung vừa mang PUBLISHED',
      closedButPublished.total === '0',
      `${closedButPublished.total} bản`,
    );

    console.log('\n6. Nợ đã biết — khai mà chưa ai đọc');
    if (DeclaredButUnread.length === 0) console.log('  (không còn mục nào)');
    for (const entry of DeclaredButUnread)
      console.log(`  …${entry.code}: ${entry.reason}`);
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Quyền theo bậc: mọi capability đều có chỗ đọc hoặc một lý do đã ghi'
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
