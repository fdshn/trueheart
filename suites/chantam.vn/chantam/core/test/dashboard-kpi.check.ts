/**
 * Số liệu điều hành trên Postgres THẬT (F59, UC-ADM-01).
 *
 * ## Vì sao bốn khối mới cần script này
 *
 * `AdminDashboardRepository` không có một dòng logic nào ngoài SQL. Mock `query` ở unit
 * test nghĩa là mock chính thứ cần kiểm — đó là lý do repo này có lớp script riêng.
 *
 * Bốn chỗ chỉ Postgres trả lời được:
 *
 * 1. **`width_bucket`** cắt số dư theo `rank_tiers.threshold_points`. Lệch một bậc là mọi
 *    con số phân bổ sai, và nó sai *êm* — bảng vẫn có đủ hàng, tổng vẫn đúng.
 * 2. **Dấu của `spentInWindow`.** `point_ledger.delta` âm khi tiêu; quên đổi dấu thì
 *    dashboard hiện "đã tiêu −5.000 điểm".
 * 3. **Mẫu số của tỷ lệ hoàn tất.** Lấy tổng mọi giao dịch thay vì `completed + cancelled`
 *    cho ra một tỷ lệ luôn thấp hơn thật, và không ai phát hiện bằng cách đọc mã.
 * 4. **`policyPublished` khác `policyEnabled`.** Hai trạng thái cho cùng một bảng toàn số
 *    0, và chỉ phân biệt được khi có dòng trong `affiliate_policy_revisions`.
 *
 * Mỗi nhóm dưới đây **dựng dữ liệu rồi tự tính tay con số mong đợi**, không so với chính
 * truy vấn vừa chạy. So một truy vấn với chính nó là phép kiểm luôn xanh.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { AdminDashboardRepository } from '../src/infrastructure/repository/admin-dashboard.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_dashboard_check';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

function userId(index: number): string {
  return `aa000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
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

  try {
    const repository = new AdminDashboardRepository(
      dataSource.manager,
      new AdminConfigRepository(dataSource.manager),
    );

    console.log('0. Bảng rỗng không làm đổ gì, và không bịa số');
    const empty = await repository.read(30);
    check(
      'tỷ lệ hoàn tất là NULL khi chưa có giao dịch nào kết thúc',
      empty.transactions.completionRatePercent === null,
      String(empty.transactions.completionRatePercent),
    );
    check('mẫu số bằng 0', empty.transactions.completionDenominator === 0);
    check('tổng số dư bằng 0', empty.points.totalBalance === 0);
    check(
      'affiliate báo CHƯA publish, không báo đã bật',
      empty.affiliate.policyPublished === false &&
        empty.affiliate.policyEnabled === false,
    );
    check(
      'phân bổ điểm có đủ một dòng cho mỗi bậc hạng đã seed',
      empty.points.byRankThreshold.length > 0,
      JSON.stringify(empty.points.byRankThreshold.map((b) => b.rank)),
    );
    check(
      'mọi bậc đều 0 người khi chưa có ai',
      empty.points.byRankThreshold.every((b) => b.users === 0),
    );

    // ── Dựng dữ liệu ───────────────────────────────────────────────────────────
    const tiers = await dataSource.query<
      { rank: string; threshold_points: number }[]
    >(
      `SELECT rank, threshold_points FROM rank_tiers ORDER BY threshold_points ASC`,
    );
    console.log(
      `\n  (bậc hạng đã seed: ${tiers
        .map((t) => `${t.rank}=${t.threshold_points}`)
        .join(', ')})`,
    );

    // Mỗi người một số dư đặt CÓ CHỦ Ý quanh các mốc: ngay dưới, đúng bằng, và trên.
    const balances: number[] = [];
    for (const tier of tiers) {
      balances.push(Math.max(0, tier.threshold_points - 1));
      balances.push(tier.threshold_points);
    }
    balances.push(0);

    for (const [index, balance] of balances.entries()) {
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [userId(index + 1), `nguoi${index + 1}`],
      );
      await dataSource.query(
        `INSERT INTO user_point_balances (user_id, balance, raw_balance, lifetime)
         VALUES ($1, $2, $2, $2)`,
        [userId(index + 1), balance],
      );
    }

    console.log('\n1. width_bucket cắt số dư đúng bậc');
    const withBalances = await repository.read(30);
    check(
      'tổng người trong mọi bậc bằng số hàng user_point_balances',
      withBalances.points.byRankThreshold.reduce(
        (sum, b) => sum + b.users,
        0,
      ) === balances.length,
      `${withBalances.points.byRankThreshold.reduce((s, b) => s + b.users, 0)} vs ${balances.length}`,
    );
    check(
      'tổng số dư khớp tổng tự tính tay',
      withBalances.points.totalBalance ===
        balances.reduce((sum, value) => sum + value, 0),
      `${withBalances.points.totalBalance} vs ${balances.reduce((s, v) => s + v, 0)}`,
    );

    // Tự tính tay phân bổ mong đợi, không hỏi lại SQL.
    const expected = tiers.map((tier, index) => {
      const next = tiers[index + 1];
      return {
        rank: tier.rank,
        users: balances.filter(
          (value) =>
            value >=
              (index === 0
                ? Number.NEGATIVE_INFINITY
                : tier.threshold_points) &&
            (next === undefined || value < next.threshold_points),
        ).length,
      };
    });
    // Bậc đầu nhận cả những ai dưới mốc đầu — `width_bucket` trả 1 cho họ, và đó là
    // chủ ý: không ai được rơi ra ngoài bảng phân bổ.
    for (const [
      index,
      bucket,
    ] of withBalances.points.byRankThreshold.entries()) {
      check(
        `bậc ${bucket.rank} (>=${bucket.thresholdPoints}) có ${expected[index].users} người`,
        bucket.users === expected[index].users,
        `nhận ${bucket.users}`,
      );
    }

    console.log('\n2. Lượt phát và lượt tiêu — dấu phải đúng');
    const ledgerRows: Array<[string, number]> = [
      ['GIFT_COMPLETED', 56],
      ['GIFT_COMPLETED', 56],
      ['REDEEM', -30],
      ['ADMIN_ADJUST', -5],
    ];
    for (const [index, [rule, delta]] of ledgerRows.entries()) {
      await dataSource.query(
        `INSERT INTO point_ledger
           (user_id, rule_code, rule_version, delta, balance_after, raw_balance_after,
            lifetime_after, reference_type, reference_id, idempotency_key, actor, source,
            reason)
         VALUES ($1, $2, 1, $3, 0, 0, 0, 'TEST', $4, $4, 'SYSTEM', 'TEST', 'kiểm chứng')`,
        [userId(1), rule, delta, `dash-${index}`],
      );
    }

    const withLedger = await repository.read(30);
    check(
      'issuedInWindow = tổng delta DƯƠNG',
      withLedger.points.issuedInWindow === 112,
      String(withLedger.points.issuedInWindow),
    );
    // Quên đổi dấu thì dashboard hiện "đã tiêu −35 điểm".
    check(
      'spentInWindow là số DƯƠNG 35, không phải −35',
      withLedger.points.spentInWindow === 35,
      String(withLedger.points.spentInWindow),
    );

    // Dòng ngoài cửa sổ phải bị loại.
    await dataSource.query(
      `INSERT INTO point_ledger
         (user_id, rule_code, rule_version, delta, balance_after, raw_balance_after,
          lifetime_after, reference_type, reference_id, idempotency_key, actor, source,
          reason, created_at)
       VALUES ($1, 'GIFT_COMPLETED', 1, 999, 0, 0, 0, 'TEST', 'cu', 'cu', 'SYSTEM',
               'TEST', 'ngoài cửa sổ', now() - interval '60 days')`,
      [userId(1)],
    );
    const narrow = await repository.read(30);
    check(
      'dòng 60 ngày trước KHÔNG vào cửa sổ 30 ngày',
      narrow.points.issuedInWindow === 112,
      String(narrow.points.issuedInWindow),
    );
    const wide = await repository.read(90);
    check(
      'nới cửa sổ lên 90 ngày thì nó vào',
      wide.points.issuedInWindow === 1_111,
      String(wide.points.issuedInWindow),
    );

    console.log('\n3. Tỷ lệ hoàn tất: mẫu số là completed + cancelled');
    const [post] = await dataSource.query<{ global_id: string }[]>(
      `INSERT INTO posts
         (global_id, author_id, post_type, category_id, title, description, status,
          location, area_label, total_quantity, remaining_quantity, details)
       SELECT gen_random_uuid(), $1, 'OFFER', category.global_id, 'Bài kiểm tra',
              'Mô tả đủ dài',
              'PUBLISHED', ST_SetSRID(ST_MakePoint(106.698, 10.7724), 4326)::geography,
              'Quận 1', 1, 1, '{}'::jsonb
       FROM categories category LIMIT 1
       RETURNING global_id`,
      [userId(1)],
    );

    // Người nhận riêng cho nhóm này: nhóm 1 chỉ dựng đủ người để phủ các mốc hạng, mà
    // nhóm này cần 12 người nhận khác nhau.
    for (let index = 100; index < 120; index += 1) {
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [userId(index), `nhan${index}`],
      );
    }

    const addTransaction = async (status: string, receiverIndex: number) => {
      // Truyền `status` HAI LẦN thành `$4` và `$5` thay vì dùng lại `$4`.
      //
      // Dùng lại một tham số ở hai chỗ có kiểu kỳ vọng khác nhau — cột `varchar` ở
      // `VALUES`, phép so sánh chuỗi ở `CASE` — làm Postgres ném
      // `inconsistent types deduced for parameter $4`. Cast cũng không cứu được, vì cast
      // chính là thứ ép ra kiểu thứ hai.
      await dataSource.query(
        `INSERT INTO gift_transactions
           (global_id, post_id, giver_id, receiver_id, status, quantity, completed_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 1,
                 CASE WHEN $5 = 'COMPLETED' THEN now() ELSE NULL END)`,
        [post.global_id, userId(1), userId(receiverIndex), status, status],
      );
    };
    // 7 hoàn tất, 3 huỷ, 2 đang chạy → 70% trên mẫu số 10, KHÔNG phải 58,3% trên 12.
    //
    // Mỗi lượt một người nhận khác: `UQ_gift_transactions_open_request` chặn hai lượt
    // xin ĐANG MỞ của cùng một người trên cùng một bài — đúng luật nghiệp vụ, nên script
    // phải tôn trọng nó chứ không tắt nó đi.
    let receiver = 100;
    for (let i = 0; i < 7; i += 1)
      await addTransaction('COMPLETED', receiver++);
    for (let i = 0; i < 3; i += 1)
      await addTransaction('CANCELLED', receiver++);
    for (let i = 0; i < 2; i += 1)
      await addTransaction('DELIVERING', receiver++);

    const withTx = await repository.read(30);
    check(
      'mẫu số là 10 (7 + 3), không tính 2 giao dịch đang chạy',
      withTx.transactions.completionDenominator === 10,
      String(withTx.transactions.completionDenominator),
    );
    check(
      'tỷ lệ là 70%, không phải 58.3%',
      withTx.transactions.completionRatePercent === 70,
      String(withTx.transactions.completionRatePercent),
    );
    check(
      'live vẫn đếm riêng 2 giao dịch đang chạy',
      withTx.transactions.live === 2,
    );

    console.log('\n4. Affiliate: policyPublished khác policyEnabled');
    await dataSource.query(
      `INSERT INTO affiliate_policy_revisions
         (version, enabled, distribution_mode, event_points_json,
          daily_cap_per_beneficiary, max_beneficiaries_per_event, reason)
       VALUES (1, false, 'SPLIT_POOL', '{}'::jsonb, 0, 0, 'ship ở trạng thái tắt')`,
    );
    const published = await repository.read(30);
    check(
      'đã publish một bản TẮT: policyPublished true, policyEnabled false',
      published.affiliate.policyPublished === true &&
        published.affiliate.policyEnabled === false,
      `published=${String(published.affiliate.policyPublished)} enabled=${String(published.affiliate.policyEnabled)}`,
    );

    await dataSource.query(
      `INSERT INTO affiliate_policy_revisions
         (version, enabled, distribution_mode, event_points_json,
          daily_cap_per_beneficiary, max_beneficiaries_per_event, reason)
       VALUES (2, true, 'SPLIT_POOL', '{"POST_CREATED": 5}'::jsonb, 100, 50, 'bật')`,
    );
    const enabled = await repository.read(30);
    // `ORDER BY version DESC` chứ không `effective_at DESC` — phải khớp
    // `AffiliateRepository.readActivePolicy`, nếu không dashboard nói một bản khác bản
    // bộ máy đang dùng.
    check(
      'bản version 2 đang bật được đọc đúng',
      enabled.affiliate.policyEnabled === true,
    );

    console.log('\n5. Giver Accuracy: ngưỡng đọc từ cấu hình động');
    await dataSource.query(
      `UPDATE users SET giver_accuracy_percent = 60, giver_accuracy_samples = 10
        WHERE global_id = $1`,
      [userId(1)],
    );
    await dataSource.query(
      `UPDATE users SET giver_accuracy_percent = 90, giver_accuracy_samples = 10
        WHERE global_id = $1`,
      [userId(2)],
    );
    // Đủ phần trăm thấp nhưng CHƯA đủ mẫu — không được tính vào `belowThreshold`, vì
    // dưới số mẫu tối thiểu thì phần trăm không có nghĩa.
    await dataSource.query(
      `UPDATE users SET giver_accuracy_percent = 10, giver_accuracy_samples = 2
        WHERE global_id = $1`,
      [userId(3)],
    );
    await dataSource.query(
      `UPDATE users SET accuracy_review_required = true WHERE global_id = $1`,
      [userId(1)],
    );

    const withAccuracy = await repository.read(30);
    check(
      'ngưỡng mặc định 75% được trả kèm',
      withAccuracy.accuracy.thresholdPercent === 75,
      String(withAccuracy.accuracy.thresholdPercent),
    );
    check(
      'chỉ đếm 2 người đủ mẫu, không đếm người mới 2 mẫu',
      withAccuracy.accuracy.measured === 2,
      String(withAccuracy.accuracy.measured),
    );
    check(
      'chỉ 1 người dưới ngưỡng — người 10% chưa đủ mẫu KHÔNG tính',
      withAccuracy.accuracy.belowThreshold === 1,
      String(withAccuracy.accuracy.belowThreshold),
    );
    check(
      '1 người đã gắn cờ chờ xem lại',
      withAccuracy.accuracy.reviewRequired === 1,
    );

    // Đổi ngưỡng qua cấu hình động: con số phải đi theo, không được là hằng số.
    await new AdminConfigRepository(dataSource.manager).publishSystemConfig({
      actorUserId: userId(1),
      key: 'accuracy.giver',
      value: { reviewThresholdPercent: 95, minSamples: 5 },
      valueType: 'JSON',
      reason: 'siết ngưỡng để kiểm chứng',
    });
    const retuned = await repository.read(30);
    check(
      'đổi ngưỡng lên 95% thì cả hai người đủ mẫu đều dưới ngưỡng',
      retuned.accuracy.thresholdPercent === 95 &&
        retuned.accuracy.belowThreshold === 2,
      `threshold=${retuned.accuracy.thresholdPercent} below=${retuned.accuracy.belowThreshold}`,
    );

    console.log('\n6. Nhóm');
    const groups = await repository.read(30);
    check(
      'chưa có nhóm nào thì mọi số bằng 0',
      groups.groups.total === 0 && groups.groups.members === 0,
      JSON.stringify(groups.groups),
    );

    console.log('\n7. Sáu khối cũ vẫn nguyên');
    const full = await repository.read(30);
    for (const key of [
      'users',
      'posts',
      'transactions',
      'media',
      'queues',
      'points',
      'groups',
      'affiliate',
      'accuracy',
    ] as const) {
      check(`khối \`${key}\` có mặt`, full[key] !== undefined);
    }
    check(
      'windowDays đi theo tham số',
      (await repository.read(7)).windowDays === 7,
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'F59: width_bucket cắt số dư đúng từng bậc hạng, lượt tiêu trả số dương, tỷ lệ hoàn tất lấy mẫu số completed+cancelled nên không bị giao dịch đang chạy kéo xuống, policyPublished phân biệt được với policyEnabled, và ngưỡng accuracy đi theo cấu hình động'
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
