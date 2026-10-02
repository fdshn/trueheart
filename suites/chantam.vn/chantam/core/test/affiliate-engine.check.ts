/**
 * Bộ máy chia thưởng affiliate trên Postgres THẬT (F56-F58).
 *
 * Toán chia thưởng và thứ tự ưu tiên vị trí đã có spec thuần ở
 * core-lib/src/models/affiliate.spec.ts. File này kiểm những thứ spec đó KHÔNG thấy
 * được, vì chúng nằm trong SQL:
 *
 * 1. Fail-closed: chưa publish, hoặc đang tắt, hoặc thiếu trần thì KHÔNG ghi gì.
 * 2. Cổng geo (F57): ST_DWithin trên geography với bán kính lưu bằng KM.
 * 3. Thứ tự ưu tiên vị trí (F58) trên dữ liệu thật: thành viên NGOÀI vùng nhưng bài
 *    đăng TRONG vùng thì sự kiện vẫn hợp lệ.
 * 4. Sự kiện ngoài vùng vẫn lưu kèm distance/radius, và KHÔNG sinh dòng reward nào.
 * 5. Giải người nhận: đúng vị ngữ mà findAffiliateSnapshot đếm.
 * 6. Chống trùng ở tầng database (BR-AFF-04), không ở phép đọc trước.
 * 7. Trần ngày: dòng CAPPED vẫn lưu, 0 điểm.
 * 8. Thu hồi: ghi thêm bút toán đảo, giữ nguyên dấu vết, gọi lại lần hai vô hại.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { AffiliateRepository } from '../src/infrastructure/repository/affiliate.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_affiliate_check';

const AdminId = 'a3000000-0000-4000-8000-00000000a001';
const OwnerId = 'a3000000-0000-4000-8000-00000000a002';
/** Trong vùng: cùng toạ độ tâm nhóm. */
const InsideA = 'a3000000-0000-4000-8000-00000000a003';
const InsideB = 'a3000000-0000-4000-8000-00000000a004';
/** Ngoài vùng: Hà Nội, cách tâm TP.HCM hơn 1.000 km. */
const OutsideId = 'a3000000-0000-4000-8000-00000000a005';
/** Trong vùng nhưng KHÔNG hoạt động gần đây. */
const StaleId = 'a3000000-0000-4000-8000-00000000a006';

// UUID chỉ nhận ký tự hex: bản đầu dùng tiền tố 'g' cho dễ đọc và Postgres ném
// 22P02 ngay câu INSERT đầu tiên.
const GroupId = 'be300000-0000-4000-8000-00000000be01';
const CategoryId = 'c3000000-0000-4000-8000-00000000c001';

const SaiGon = { lat: 10.7724, lng: 106.698 };
const HaNoi = { lat: 21.0278, lng: 105.8342 };

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function expectThrow(
  label: string,
  run: () => Promise<unknown>,
  expected: string,
): Promise<void> {
  try {
    await run();
    check(label, false, 'không ném gì');
  } catch (error) {
    const name = (error as Error).constructor.name;
    check(label, name === expected, name);
  }
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

  const ledger = new PointLedgerRepository(dataSource.manager);
  const affiliate = new AffiliateRepository(
    dataSource.manager,
    ledger,
    new AdminConfigRepository(dataSource.manager),
  );

  const addUser = async (
    id: string,
    username: string,
    location: { lat: number; lng: number } | null,
    activeDaysAgo = 0,
  ) => {
    await dataSource.query(
      `INSERT INTO users
         (global_id, username, password_hash, rank, status, default_location, last_active_at)
       VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE',
               CASE WHEN $3::float8 IS NULL THEN NULL
                    ELSE ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography END,
               now() - make_interval(days => $5))`,
      [
        id,
        username,
        location?.lat ?? null,
        location?.lng ?? null,
        activeDaysAgo,
      ],
    );
  };

  const addMember = async (userId: string, role = 'MEMBER') => {
    await dataSource.query(
      `INSERT INTO group_memberships (global_id, group_id, user_id, role, status)
       VALUES (gen_random_uuid(), $1, $2, $3, 'ACTIVE')`,
      [GroupId, userId, role],
    );
  };

  const publish = async (input: {
    expectedVersion: number | null;
    enabled: boolean;
    mode: 'SPLIT_POOL' | 'PER_MEMBER';
    postPoints: number;
    giftPoints: number;
    dailyCap: number;
    maxBeneficiaries: number;
  }) =>
    affiliate.publishPolicy({
      actorUserId: AdminId,
      expectedVersion: input.expectedVersion,
      policy: {
        enabled: input.enabled,
        distributionMode: input.mode,
        eventPoints: {
          POST_CREATED: input.postPoints,
          GIFT_COMPLETED: input.giftPoints,
        },
        dailyCapPerBeneficiary: input.dailyCap,
        maxBeneficiariesPerEvent: input.maxBeneficiaries,
      },
      effectiveAt: new Date(Date.now() - 60_000),
      reason: 'Kiểm chứng F56-F58',
    });

  let eventSeq = 0;
  const fire = async (params: {
    eventType: 'POST_CREATED' | 'GIFT_COMPLETED';
    sourceUserId: string;
    postLocation?: { lat: number; lng: number } | null;
    referenceId?: string;
  }) => {
    eventSeq += 1;
    return dataSource.manager.transaction(async (manager) =>
      affiliate.recordEvent(manager, {
        eventType: params.eventType,
        sourceUserId: params.sourceUserId,
        referenceType: 'POST',
        referenceId: params.referenceId ?? `ref-${eventSeq}`,
        postLocation: params.postLocation,
      }),
    );
  };

  try {
    await addUser(AdminId, 'admin-affiliate', null);
    await addUser(OwnerId, 'chu-nhom', SaiGon);
    await addUser(InsideA, 'trong-vung-a', SaiGon);
    await addUser(InsideB, 'trong-vung-b', SaiGon);
    await addUser(OutsideId, 'ngoai-vung', HaNoi);
    await addUser(StaleId, 'trong-vung-im-lang', SaiGon, 400);

    await dataSource.query(
      `INSERT INTO groups
         (global_id, owner_id, name, region_label, center_location, radius_km,
          invite_code, status, activated_at)
       VALUES ($1, $2, 'Nhóm kiểm affiliate', 'TP.HCM',
               ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
               10, 'MACODE01', 'ACTIVE', now())`,
      [GroupId, OwnerId, SaiGon.lat, SaiGon.lng],
    );
    for (const id of [OwnerId, InsideA, InsideB, OutsideId, StaleId])
      await addMember(id, id === OwnerId ? 'OWNER' : 'MEMBER');

    // ── 1. Fail-closed ──────────────────────────────────────────────────────
    console.log('1. Chưa publish chính sách thì KHÔNG ghi gì');
    const noPolicy = await fire({
      eventType: 'POST_CREATED',
      sourceUserId: InsideA,
      postLocation: SaiGon,
    });
    check('chưa có policy thì recordEvent trả null', noPolicy === null);
    const [{ count: zeroEvents }] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM affiliate_events`,
    );
    check(
      'và không hàng nào trong affiliate_events',
      Number(zeroEvents) === 0,
      `count=${zeroEvents}`,
    );

    console.log(
      '\n2. Publish: xung đột version, và chặn bản bật mà thiếu trần',
    );
    const v1 = await publish({
      expectedVersion: null,
      enabled: false,
      mode: 'SPLIT_POOL',
      postPoints: 0,
      giftPoints: 0,
      dailyCap: 0,
      maxBeneficiaries: 0,
    });
    check('bản đầu là version 1', v1.version === 1, `version=${v1.version}`);

    await expectThrow(
      'bật mà thiếu trần bị TỪ CHỐI — đây là cửa farm điểm',
      () =>
        publish({
          expectedVersion: 1,
          enabled: true,
          mode: 'SPLIT_POOL',
          postPoints: 10,
          giftPoints: 10,
          dailyCap: 0,
          maxBeneficiaries: 0,
        }),
      'ValidationFailedException',
    );

    await expectThrow(
      'expectedVersion lệch bị từ chối',
      () =>
        publish({
          expectedVersion: 99,
          enabled: true,
          mode: 'SPLIT_POOL',
          postPoints: 10,
          giftPoints: 10,
          dailyCap: 50,
          maxBeneficiaries: 100,
        }),
      'ValidationFailedException',
    );

    const disabled = await fire({
      eventType: 'POST_CREATED',
      sourceUserId: InsideA,
      postLocation: SaiGon,
    });
    check('bản đang TẮT thì vẫn trả null', disabled === null);

    const v2 = await publish({
      expectedVersion: 1,
      enabled: true,
      mode: 'SPLIT_POOL',
      postPoints: 10,
      giftPoints: 20,
      dailyCap: 50,
      maxBeneficiaries: 100,
    });
    check(
      'bản hợp lệ lên version 2',
      v2.version === 2,
      `version=${v2.version}`,
    );
    const active = await affiliate.getActivePolicy();
    check(
      'bản publish SAU thắng dù mốc hiệu lực sớm hơn',
      active?.version === 2 && active.policy.enabled === true,
      `version=${active?.version}`,
    );

    // ── 3. Cổng geo và giải người nhận ──────────────────────────────────────
    console.log('\n3. Sự kiện TRONG vùng: chia cho đúng Active Member');
    const inside = await fire({
      eventType: 'POST_CREATED',
      sourceUserId: InsideA,
      postLocation: SaiGon,
      referenceId: 'post-inside',
    });
    check(
      'kết luận ELIGIBLE, nguồn toạ độ là POST',
      inside?.geoStatus === 'ELIGIBLE' && inside.locationSource === 'POST',
      `${inside?.geoStatus}/${inside?.locationSource}`,
    );
    // Người nhận hợp lệ: Owner + InsideA + InsideB. OutsideId ngoài bán kính,
    // StaleId im lặng 400 ngày nên ngoài cửa sổ hoạt động.
    check(
      'đúng 3 người nhận — loại người ngoài vùng VÀ người im lặng',
      inside?.beneficiaryCount === 3,
      `count=${inside?.beneficiaryCount}`,
    );
    check(
      'SPLIT_POOL: giỏ 10 chia 3 vẫn phát đủ 10, không bay mất điểm',
      inside?.totalPoints === 10,
      `total=${inside?.totalPoints}`,
    );

    const rewards = await affiliate.listRewards(
      (
        await dataSource.query<{ global_id: string }[]>(
          `SELECT global_id FROM affiliate_events WHERE reference_id = 'post-inside'`,
        )
      )[0].global_id,
    );
    check(
      'ba dòng reward, tổng đúng 10, phần dư về người đầu',
      rewards.length === 3 &&
        rewards.reduce((sum, r) => sum + r.pointDelta, 0) === 10,
      rewards.map((r) => `${r.pointDelta}`).join('/'),
    );
    check(
      'mỗi dòng AWARDED đều trỏ tới một bút toán trong point_ledger',
      rewards.every(
        (r) => r.rewardStatus !== 'AWARDED' || r.pointLedgerId !== null,
      ),
    );

    // ── 4. Ngoài vùng ───────────────────────────────────────────────────────
    console.log(
      '\n4. Sự kiện NGOÀI vùng: lưu để audit, 0 điểm, KHÔNG dòng reward',
    );
    const outside = await fire({
      eventType: 'POST_CREATED',
      sourceUserId: InsideA,
      postLocation: HaNoi,
      referenceId: 'post-outside',
    });
    check(
      'kết luận NOT_ELIGIBLE_GEO và 0 điểm',
      outside?.geoStatus === 'NOT_ELIGIBLE_GEO' && outside.totalPoints === 0,
      `${outside?.geoStatus}/${outside?.totalPoints}`,
    );
    check(
      'ghi lại khoảng cách và bán kính để trả lời được "vì sao bị loại"',
      (outside?.distanceMeters ?? 0) > 1_000_000 &&
        outside?.radiusMeters === 10_000,
      `distance=${outside?.distanceMeters} radius=${outside?.radiusMeters}`,
    );
    const [{ count: outsideRewards }] = await dataSource.query<
      { count: string }[]
    >(
      `SELECT COUNT(*) AS count FROM affiliate_rewards reward
       INNER JOIN affiliate_events event ON event.id = reward.event_id
       WHERE event.reference_id = 'post-outside'`,
    );
    check(
      'KHÔNG sinh dòng reward 0 điểm cho từng thành viên',
      Number(outsideRewards) === 0,
      `count=${outsideRewards}`,
    );

    // ── 5. Thứ tự ưu tiên vị trí (F58) trên dữ liệu thật ───────────────────
    console.log('\n5. Thứ tự ưu tiên: người NGOÀI vùng đăng bài TRONG vùng');
    const byPost = await fire({
      eventType: 'POST_CREATED',
      sourceUserId: OutsideId,
      postLocation: SaiGon,
      referenceId: 'post-by-outsider',
    });
    check(
      'toạ độ BÀI thắng Vị trí mặc định — sự kiện vẫn hợp lệ',
      byPost?.geoStatus === 'ELIGIBLE' && byPost.locationSource === 'POST',
      `${byPost?.geoStatus}/${byPost?.locationSource}`,
    );

    const byMember = await fire({
      eventType: 'GIFT_COMPLETED',
      sourceUserId: OutsideId,
      postLocation: null,
      referenceId: 'tx-no-location',
    });
    check(
      'không có toạ độ nghiệp vụ thì lùi về MEMBER_DEFAULT, và ở đây là ngoài vùng',
      byMember?.locationSource === 'MEMBER_DEFAULT' &&
        byMember.geoStatus === 'NOT_ELIGIBLE_GEO',
      `${byMember?.locationSource}/${byMember?.geoStatus}`,
    );

    // ── 6. Chống trùng ở tầng database ──────────────────────────────────────
    console.log('\n6. Chống trùng (BR-AFF-04)');
    const again = await fire({
      eventType: 'POST_CREATED',
      sourceUserId: InsideA,
      postLocation: SaiGon,
      referenceId: 'post-inside',
    });
    check('cùng sự kiện gốc gọi lại trả null', again === null);
    const [{ count: stillThree }] = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM affiliate_rewards reward
       INNER JOIN affiliate_events event ON event.id = reward.event_id
       WHERE event.reference_id = 'post-inside'`,
    );
    check(
      'vẫn đúng ba dòng reward, không cộng lần hai',
      Number(stillThree) === 3,
      `count=${stillThree}`,
    );

    const ledgerRows = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM point_ledger WHERE rule_code = 'GROUP_AFFILIATE'`,
    );
    const ledgerCount = Number(ledgerRows[0].count);

    // ── 7. Trần ngày ───────────────────────────────────────────────────────
    console.log('\n7. Trần ngày: dòng CAPPED vẫn lưu, 0 điểm');
    const v3 = await publish({
      expectedVersion: 2,
      enabled: true,
      mode: 'PER_MEMBER',
      postPoints: 1,
      giftPoints: 1,
      // Trần 1 điểm/ngày: mọi người đã nhận điểm ở mục 3 nên lượt này phải CAPPED.
      dailyCap: 1,
      maxBeneficiaries: 100,
    });
    check('bản version 3 với PER_MEMBER', v3.version === 3);

    const capped = await fire({
      eventType: 'POST_CREATED',
      sourceUserId: InsideA,
      postLocation: SaiGon,
      referenceId: 'post-capped',
    });
    check(
      'người đã đầy trần thì vào CAPPED, không phát thêm điểm',
      capped?.cappedCount === 3 && capped.totalPoints === 0,
      `capped=${capped?.cappedCount} total=${capped?.totalPoints}`,
    );
    const cappedRewards = await affiliate.listRewards(
      (
        await dataSource.query<{ global_id: string }[]>(
          `SELECT global_id FROM affiliate_events WHERE reference_id = 'post-capped'`,
        )
      )[0].global_id,
    );
    check(
      'dòng CAPPED VẪN lưu để Owner thấy họ có trong danh sách chia',
      cappedRewards.length === 3 &&
        cappedRewards.every(
          (r) => r.rewardStatus === 'CAPPED' && r.pointDelta === 0,
        ),
      `rows=${cappedRewards.length}`,
    );
    const afterCap = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM point_ledger WHERE rule_code = 'GROUP_AFFILIATE'`,
    );
    check(
      'và KHÔNG sinh bút toán điểm nào thêm',
      Number(afterCap[0].count) === ledgerCount,
      `${ledgerCount} -> ${afterCap[0].count}`,
    );

    // ── 8. Thu hồi ─────────────────────────────────────────────────────────
    console.log('\n8. Thu hồi (câu A5): ghi thêm bút toán đảo, giữ dấu vết');
    const [insideEvent] = await dataSource.query<{ global_id: string }[]>(
      `SELECT global_id FROM affiliate_events WHERE reference_id = 'post-inside'`,
    );
    const reversal = await affiliate.reverseEvent({
      eventGlobalId: insideEvent.global_id,
      actorUserId: AdminId,
      reason: 'Xác minh là tài khoản ảo',
    });
    check(
      'thu hồi đúng 3 dòng và 10 điểm',
      reversal.reversedCount === 3 && reversal.pointsReclaimed === 10,
      `${reversal.reversedCount} dòng / ${reversal.pointsReclaimed} điểm`,
    );

    const reversedRewards = await affiliate.listRewards(insideEvent.global_id);
    check(
      'dòng reward sang REVERSED nhưng GIỮ số điểm gốc và bút toán gốc',
      reversedRewards.every(
        (r) =>
          r.rewardStatus === 'REVERSED' &&
          r.pointDelta > 0 &&
          r.pointLedgerId !== null &&
          r.reversedAt !== null,
      ),
      reversedRewards.map((r) => `${r.rewardStatus}:${r.pointDelta}`).join(' '),
    );

    const [{ count: reversalEntries }] = await dataSource.query<
      { count: string }[]
    >(
      `SELECT COUNT(*) AS count FROM point_ledger
       WHERE rule_code = 'GROUP_AFFILIATE_REVERSAL' AND delta < 0`,
    );
    check(
      'ba bút toán ĐẢO trong point_ledger — lịch sử không bị xoá',
      Number(reversalEntries) === 3,
      `count=${reversalEntries}`,
    );

    const twice = await affiliate.reverseEvent({
      eventGlobalId: insideEvent.global_id,
      actorUserId: AdminId,
      reason: 'Bấm lại lần hai',
    });
    check(
      'thu hồi lần hai là vô hại, trả 0/0 thay vì ném',
      twice.reversedCount === 0 && twice.pointsReclaimed === 0,
      `${twice.reversedCount}/${twice.pointsReclaimed}`,
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'F56-F58: chính sách fail-closed và có version, cổng geo chạy trên ST_DWithin thật, thứ tự ưu tiên vị trí đúng đặc tả, sự kiện ngoài vùng lưu kèm số đo mà không sinh dòng rác, trần ngày chặn được, và thu hồi ghi thêm bút toán đảo'
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
