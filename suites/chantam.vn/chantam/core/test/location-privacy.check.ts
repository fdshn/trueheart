/**
 * Kiểm ngưỡng "ai được thấy toạ độ thật" trên Postgres THẬT (25 §25.1).
 *
 * ## Vì sao cần, khi jitter đã có unit test đủ
 *
 * `geo-jitter.spec.ts` đã canh phần toán: tất định theo seed, không vượt bán kính, thật
 * sự dịch đi. Thứ nó không thể canh là **ai** được bỏ qua bước đó — và từ 01/10 câu trả
 * lời không còn là một phép so `userId === authorId` mà là `isReceiverOfPost`, một câu
 * SQL lọc theo danh sách trạng thái giao dịch.
 *
 * Danh sách trạng thái đúng là loại thứ dễ trôi nhất: bảng có SÁU trạng thái
 * (`REQUESTED`, `ACCEPTED`, `DELIVERING`, `COMPLETED`, `CANCELLED`, `REJECTED`) và chỉ
 * ba trong số đó được thấy địa chỉ. Thêm một trạng thái mới mà quên sửa câu này thì
 * hoặc người lạ thấy nhà người ta, hoặc người nhận thật bị chỉ sai chỗ — và unit test
 * mock `query` xanh trong cả hai ca.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { AffiliateRepository } from '../src/infrastructure/repository/affiliate.repository';
import { ChatRepository } from '../src/infrastructure/repository/chat.repository';
import { CheckInRepository } from '../src/infrastructure/repository/check-in.repository';
import { GiftTransactionRepository } from '../src/infrastructure/repository/gift-transaction.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_location_privacy_check';
const CategoryId = 'd0000000-0000-4000-8000-00000000d001';
const Giver = 'd0000000-0000-4000-8000-00000000d002';
const Receiver = 'd0000000-0000-4000-8000-00000000d003';
const Stranger = 'd0000000-0000-4000-8000-00000000d004';

/**
 * Ba trạng thái CHO xem địa chỉ, và những trạng thái KHÔNG.
 *
 * Bảng có HAI ràng buộc CHECK chồng nhau trên cùng cột `status`:
 * `CHK_gift_transactions_status` cho sáu giá trị, còn
 * `CHK_gift_transactions_live_status` chỉ cho bốn. Cái chặt hơn thắng, nên `REQUESTED`
 * và `REJECTED` **không thể tồn tại** — chúng là giá trị chết còn lại từ lần dọn 28/09.
 * Phép kiểm ở mục 3 vì thế đọc ràng buộc CÓ HIỆU LỰC, không đọc cái rộng hơn.
 */
const SeesAddress = ['ACCEPTED', 'DELIVERING', 'COMPLETED'] as const;
const DoesNotSee = ['CANCELLED'] as const;

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

  const transactions = new GiftTransactionRepository(
    dataSource.manager,
    new ChatRepository(
      dataSource.manager,
      new AdminConfigRepository(dataSource.manager),
    ),
    new PointLedgerRepository(dataSource.manager),
    // `CheckInRepository` là tham số thật, không mock: ở đây chưa publish policy F83 nào nên
    // `accrueFromCompletedTransaction` thoát sớm. Nhờ vậy tám script này canh luôn
    // nhánh "tính năng tắt thì KHÔNG tích lượt bù" mà không phải viết gì thêm.
    new CheckInRepository(
      dataSource.manager,
      new PointLedgerRepository(dataSource.manager),
    ),
    new AffiliateRepository(
      dataSource.manager,
      new PointLedgerRepository(dataSource.manager),
      new AdminConfigRepository(dataSource.manager),
    ),
  );

  let postSeq = 0;
  /** Một bài kèm một giao dịch ở trạng thái cho trước. Trả id bài. */
  const makeDeal = async (status: string): Promise<string> => {
    postSeq += 1;
    const postId = `d0000000-0000-4000-8000-00000000e0${String(postSeq).padStart(2, '0')}`;
    await dataSource.query(
      `INSERT INTO posts
         (global_id, post_type, author_id, category_id, title, description,
          location, area_label, status, total_quantity, remaining_quantity,
          details, renewed_count)
       VALUES ($1, 'OFFER', $2, $3, 'Bài kiểm riêng tư vị trí',
               'Mô tả đủ dài cho bài kiểm ngưỡng xem toạ độ thật',
               ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
               'Quận 1', 'RESERVED', 1, 0, '{}'::jsonb, 0)`,
      [postId, Giver, CategoryId],
    );
    await dataSource.query(
      // `completed_at` tính ở TypeScript chứ không bằng `CASE WHEN $5 = 'COMPLETED'`:
      // dùng cùng một tham số ở hai vai làm Postgres suy ra hai kiểu và từ chối cả câu.
      // `CHK_gift_transactions_completed_at` đòi hai thứ này khớp nhau.
      `INSERT INTO gift_transactions
         (global_id, post_id, giver_id, receiver_id, quantity, status, completed_at)
       VALUES ($1, $2, $3, $4, 1, $5, $6)`,
      [
        `d0000000-0000-4000-8000-00000000f0${String(postSeq).padStart(2, '0')}`,
        postId,
        Giver,
        Receiver,
        status,
        status === 'COMPLETED' ? new Date() : null,
      ],
    );

    return postId;
  };

  try {
    await dataSource.query(
      `INSERT INTO categories (global_id, name, slug, is_active)
       VALUES ($1, 'Kiểm riêng tư', 'kiem-rieng-tu', true)`,
      [CategoryId],
    );
    for (const [id, name] of [
      [Giver, 'nguoi-tang-vt'],
      [Receiver, 'nguoi-nhan-vt'],
      [Stranger, 'nguoi-la-vt'],
    ] as const)
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, name],
      );

    console.log('1. Ba trạng thái CHO người nhận xem địa chỉ');
    for (const status of SeesAddress) {
      const postId = await makeDeal(status);
      check(
        `${status}: người nhận được xem`,
        await transactions.isReceiverOfPost(postId, Receiver),
      );
      check(
        `${status}: người LẠ thì không`,
        !(await transactions.isReceiverOfPost(postId, Stranger)),
      );
    }

    console.log('\n2. Trạng thái đã đổ thì KHÔNG cho xem');
    for (const status of DoesNotSee) {
      const postId = await makeDeal(status);
      check(
        `${status}: người nhận cũng KHÔNG được xem`,
        !(await transactions.isReceiverOfPost(postId, Receiver)),
        'giao dịch chưa chạy hoặc đã đổ thì địa chỉ không còn lý do để mở',
      );
    }

    console.log('\n3. Mọi trạng thái của bảng đều được phân loại');
    // Thiếu phép kiểm này thì thêm một trạng thái mới vào `CHK_gift_transactions_status`
    // mà quên sửa `isReceiverOfPost` sẽ lọt — và nó lọt về phía KHÔNG cho xem, tức
    // người nhận thật bị chỉ sai chỗ mà không ai thấy gì đổ.
    const [row] = await dataSource.query<{ definition: string }[]>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid = 'gift_transactions'::regclass
         AND conname = 'CHK_gift_transactions_live_status'`,
    );
    const declared = [...row.definition.matchAll(/'([A-Z_]+)'/g)].map(
      (match) => match[1],
    );
    const classified = [...SeesAddress, ...DoesNotSee];
    check(
      'không trạng thái nào ngoài danh sách đã phân loại',
      declared.every((status) => classified.includes(status as never)),
      declared
        .filter((status) => !classified.includes(status as never))
        .join(', ') || `${declared.length} trạng thái`,
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Riêng tư vị trí: đúng ba trạng thái mở địa chỉ, người lạ không bao giờ thấy'
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
