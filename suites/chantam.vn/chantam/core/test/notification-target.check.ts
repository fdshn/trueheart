/**
 * Đích điều hướng của thông báo trên Postgres THẬT.
 *
 * ## Bốn thứ chỉ database trả lời được
 *
 * 1. **Backfill đúng cho dữ liệu cũ.** Migration chạy SAU khi đã có thông báo kiểu cũ
 *    (chỉ `reference_*`), và phải suy ra đúng màn cha qua các bảng con: yêu cầu xin đồ
 *    → bài, lượt đóng góp / giao nhận → hoạt động, bình luận → bài, tin nhắn → phòng.
 *    Database trắng thì backfill chạy trên 0 dòng — xanh mà không chứng minh gì, nên
 *    script dựng schema làm HAI pha và seed dữ liệu đầy đủ vào giữa.
 * 2. **`CHK_notifications_target`** chặn cặp sai: đích cần id mà thiếu id, màn "của
 *    tôi" mà có id.
 * 3. **Đường ghi thật** (`DispatchNotificationUseCase` → `NotificationRepository`)
 *    ghi đúng hai cột mới.
 * 4. **`targetId` mở được thật**: mỗi đích trỏ tới một dòng còn tồn tại trong đúng
 *    bảng, và hai endpoint chi tiết mới chạy đúng luật quyền trên dữ liệu thật.
 *
 *   npm run test:notification-target
 */
import {
  NotificationTargetTypes,
  NotificationTypes,
  SingletonNotificationTargets,
} from '@chantam.vn/chantam.core-lib/consts';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { GetCharityContributionUseCase } from '../src/application/implementations/charity-campaign/charity-campaign.use-cases';
import { GetGiftRequestUseCase } from '../src/application/implementations/gift-request/my-gift-requests.use-cases';
import { DispatchNotificationUseCase } from '../src/application/implementations/notification/dispatch-notification.use-case';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { seedFullData } from '../src/infrastructure/persistence/seeds/full/seed-full-data';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { CharityCampaignRepository } from '../src/infrastructure/repository/charity-campaign.repository';
import { GiftRequestRepository } from '../src/infrastructure/repository/gift-request.repository';
import { NotificationRepository } from '../src/infrastructure/repository/notification.repository';
import { PointLedgerRepository } from '../src/infrastructure/repository/point-ledger.repository';
import { ReportRepository } from '../src/infrastructure/repository/report.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_notification_target_check';
const NewMigration = 'AddNotificationTargets1801100000000';

/** Bảng chứa từng loại đích — để kiểm `targetId` trỏ tới một dòng có thật. */
const TargetTables: Record<string, string> = {
  POST: 'posts',
  GIFT_TRANSACTION: 'gift_transactions',
  CHAT_ROOM: 'chat_rooms',
  CHARITY_CAMPAIGN: 'campaigns',
  DHARMA_THREAD: 'dharma_threads',
};

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function expectReject(
  label: string,
  run: () => Promise<unknown>,
  fragment: string,
): Promise<void> {
  try {
    await run();
    check(label, false, 'không ném gì — ràng buộc không chặn');
  } catch (error) {
    const message = (error as Error).message;
    check(label, message.includes(fragment), message.slice(0, 100));
  }
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

  const allMigrations = resolveAllEntities(migrations) as {
    name: string;
  }[];
  const opened: DataSource[] = [];

  // ── Pha 1: schema TRƯỚC migration mới + dữ liệu đầy đủ + thông báo kiểu cũ ──
  const before = new DataSource({
    type: 'postgres',
    url: scratchUri,
    // Chỉ entity để seed chạy được; thông báo cũ chèn bằng SQL tay.
    entities: resolveAllEntities(entities),
    migrations: allMigrations.filter(
      (migration) => migration.name !== NewMigration,
    ) as never,
    migrationsTableName: 'migrations',
  });
  await before.initialize();
  opened.push(before);
  await before.runMigrations();
  await seedFullData(before);
  console.log('Pha 1: schema cũ + seed đầy đủ\n');

  const one = async <T>(sql: string, params: unknown[] = []): Promise<T> => {
    const [row] = await before.query<T[]>(sql, params);
    if (!row) throw new Error(`Seed thiếu dữ liệu cho: ${sql}`);
    return row;
  };
  const request = await one<{ global_id: string; post_id: string }>(
    `SELECT global_id, post_id FROM gift_requests LIMIT 1`,
  );
  const contribution = await one<{ global_id: string; campaign_id: string }>(
    `SELECT global_id, campaign_id FROM campaign_contributions LIMIT 1`,
  );
  const delivery = await one<{ global_id: string; campaign_id: string }>(
    `SELECT global_id, campaign_id FROM campaign_deliveries LIMIT 1`,
  );
  const comment = await one<{ global_id: string; subject_id: string }>(
    `SELECT global_id, subject_id FROM content_comments
      WHERE subject_type = 'POST' LIMIT 1`,
  );
  const message = await one<{ global_id: string; room_id: string }>(
    `SELECT global_id, room_id FROM chat_messages LIMIT 1`,
  );
  const deal = await one<{ global_id: string }>(
    `SELECT global_id FROM gift_transactions LIMIT 1`,
  );
  const reporter = await one<{ global_id: string }>(
    `SELECT global_id FROM users ORDER BY id LIMIT 1`,
  );
  const recipient = reporter.global_id;

  // Báo xấu cũ của chính người nhận, để REPORT_REVIEWED kiểu cũ tra được loại nội dung.
  await before.query(
    `INSERT INTO reports
       (global_id, reporter_user_id, target_type, target_id, reason, description, status)
     VALUES (gen_random_uuid(), $1, 'COMMENT', $2, 'OTHER', 'Kiểm backfill', 'RESOLVED')`,
    [recipient, comment.global_id],
  );

  const legacy: {
    label: string;
    type: NotificationTypes;
    referenceType: string | null;
    referenceId: string | null;
    expected: { type: string; id: string | null } | null;
  }[] = [
    {
      label: 'yêu cầu xin đồ → BÀI của nó',
      type: NotificationTypes.GIFT_REQUEST_CREATED,
      referenceType: 'GIFT_REQUEST',
      referenceId: request.global_id,
      expected: { type: 'POST', id: request.post_id },
    },
    {
      label: 'lượt đóng góp → HOẠT ĐỘNG',
      type: NotificationTypes.CHARITY_CONTRIBUTION_SUBMITTED,
      referenceType: 'CHARITY_CONTRIBUTION',
      referenceId: contribution.global_id,
      expected: { type: 'CHARITY_CAMPAIGN', id: contribution.campaign_id },
    },
    {
      label: 'lượt giao nhận → HOẠT ĐỘNG',
      type: NotificationTypes.CHARITY_DELIVERY_COMPLETED,
      referenceType: 'CHARITY_DELIVERY',
      referenceId: delivery.global_id,
      expected: { type: 'CHARITY_CAMPAIGN', id: delivery.campaign_id },
    },
    {
      label: 'bài → chính nó',
      type: NotificationTypes.POST_EXPIRED,
      referenceType: 'POST',
      referenceId: request.post_id,
      expected: { type: 'POST', id: request.post_id },
    },
    {
      label: 'lượt trao → chính nó',
      type: NotificationTypes.GIFT_TRANSACTION_COMPLETED,
      referenceType: 'GIFT_TRANSACTION',
      referenceId: deal.global_id,
      expected: { type: 'GIFT_TRANSACTION', id: deal.global_id },
    },
    {
      label: 'phòng chat → chính nó',
      type: NotificationTypes.NEW_CHAT_MESSAGE,
      referenceType: 'CHAT_ROOM',
      referenceId: message.room_id,
      expected: { type: 'CHAT_ROOM', id: message.room_id },
    },
    {
      label: 'thăng hạng → màn hạng của tôi, id NULL',
      type: NotificationTypes.RANK_PROMOTED,
      referenceType: 'USER_RANK',
      referenceId: recipient,
      expected: { type: 'RANK', id: null },
    },
    {
      label: 'giới thiệu → màn giới thiệu của tôi, id NULL',
      type: NotificationTypes.REFERRAL_QUALIFIED,
      referenceType: 'REFERRAL',
      referenceId: recipient,
      expected: { type: 'REFERRAL', id: null },
    },
    {
      label: 'bình luận bị xử lý → BÀI chứa nó',
      type: NotificationTypes.CONTENT_MODERATED,
      referenceType: 'COMMENT',
      referenceId: comment.global_id,
      expected: { type: 'POST', id: comment.subject_id },
    },
    {
      label: 'tin nhắn bị xử lý → PHÒNG chứa nó',
      type: NotificationTypes.CONTENT_MODERATED,
      referenceType: 'CHAT_MESSAGE',
      referenceId: message.global_id,
      expected: { type: 'CHAT_ROOM', id: message.room_id },
    },
    {
      label:
        'REPORT_REVIEWED kiểu cũ (id nội dung dưới nhãn REPORT) → tra qua báo xấu',
      type: NotificationTypes.REPORT_REVIEWED,
      referenceType: 'REPORT',
      referenceId: comment.global_id,
      expected: { type: 'POST', id: comment.subject_id },
    },
    {
      label: 'báo xấu một NGƯỜI → không có màn',
      type: NotificationTypes.CONTENT_MODERATED,
      referenceType: 'USER',
      referenceId: recipient,
      expected: null,
    },
    {
      label: 'yêu cầu đã biến mất → không có màn, không đoán',
      type: NotificationTypes.GIFT_REQUEST_REJECTED,
      referenceType: 'GIFT_REQUEST',
      referenceId: randomUUID(),
      expected: null,
    },
    {
      label: 'thông báo âm lịch → không có màn',
      type: NotificationTypes.LUNAR_OBSERVANCE,
      referenceType: 'LUNAR',
      referenceId: null,
      expected: null,
    },
  ];

  const legacyIds: string[] = [];
  for (const row of legacy) {
    const id = randomUUID();
    legacyIds.push(id);
    await before.query(
      `INSERT INTO notifications
         (global_id, user_id, type, title, body, reference_type, reference_id)
       VALUES ($1, $2, $3, 'cũ', 'cũ', $4, $5)`,
      [id, recipient, row.type, row.referenceType, row.referenceId],
    );
  }
  await before.destroy();
  opened.pop();

  // ── Pha 2: chạy migration mới trên dữ liệu đó ───────────────────────────
  const dataSource = new DataSource({
    type: 'postgres',
    url: scratchUri,
    entities: resolveAllEntities(entities),
    migrations: allMigrations as never,
    migrationsTableName: 'migrations',
  });
  await dataSource.initialize();
  opened.push(dataSource);

  try {
    const ran = await dataSource.runMigrations();
    check(
      'pha 2 chỉ chạy đúng migration mới',
      ran.length === 1 && ran[0].name === NewMigration,
      ran.map((migration) => migration.name).join(', '),
    );

    console.log('\n1. Backfill thông báo cũ');
    for (const [index, row] of legacy.entries()) {
      const [stored] = await dataSource.query<
        { target_type: string | null; target_id: string | null }[]
      >(
        `SELECT target_type, target_id FROM notifications WHERE global_id = $1`,
        [legacyIds[index]],
      );
      const actual =
        stored?.target_type === null || stored === undefined
          ? null
          : { type: stored.target_type, id: stored.target_id };
      check(
        row.label,
        JSON.stringify(actual) === JSON.stringify(row.expected),
        JSON.stringify(actual),
      );
    }

    console.log('\n2. Ràng buộc CHK_notifications_target');
    const insertWithTarget = (type: string, id: string | null) =>
      dataSource.query(
        `INSERT INTO notifications
           (global_id, user_id, type, title, body, target_type, target_id)
         VALUES (gen_random_uuid(), $1, 'POST_EXPIRED', 'x', 'y', $2, $3)`,
        [recipient, type, id],
      );
    await expectReject(
      'đích cần id mà thiếu id bị chặn',
      () => insertWithTarget('POST', null),
      'CHK_notifications_target',
    );
    // Enum và CHECK là hai danh sách viết ở hai nơi. Thêm một màn vào enum mà quên
    // CHECK là mọi thông báo mở màn đó nổ lúc ghi.
    const rejectedByCheck: string[] = [];
    for (const targetType of Object.values(NotificationTargetTypes)) {
      try {
        await dataSource.query(
          `INSERT INTO notifications
             (global_id, user_id, type, title, body, target_type, target_id)
           VALUES (gen_random_uuid(), $1, 'POST_EXPIRED', 'check-probe', 'y', $2, $3)`,
          [
            recipient,
            targetType,
            SingletonNotificationTargets.has(targetType) ? null : randomUUID(),
          ],
        );
      } catch {
        rejectedByCheck.push(targetType);
      }
    }
    // Dòng thử trỏ vào id ngẫu nhiên — dọn đi để mục 4 chỉ đo đích thật.
    await dataSource.query(
      `DELETE FROM notifications WHERE title = 'check-probe'`,
    );
    check(
      'CHECK nhận MỌI giá trị của NotificationTargetTypes',
      rejectedByCheck.length === 0,
      rejectedByCheck.join(', '),
    );
    await expectReject(
      'màn "của tôi" mà có id bị chặn',
      () => insertWithTarget('RANK', randomUUID()),
      'CHK_notifications_target',
    );
    await expectReject(
      'loại đích lạ bị chặn',
      () => insertWithTarget('NOT_A_SCREEN', randomUUID()),
      'CHK_notifications_target',
    );
    await expectReject(
      'có id mà không có loại bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO notifications
             (global_id, user_id, type, title, body, target_id)
           VALUES (gen_random_uuid(), $1, 'POST_EXPIRED', 'x', 'y', $2)`,
          [recipient, randomUUID()],
        ),
      'CHK_notifications_target',
    );

    console.log('\n3. Đường ghi thật ghi đúng hai cột mới');
    const notifications = new NotificationRepository(dataSource.manager);
    const dispatch = new DispatchNotificationUseCase(
      notifications,
      { canSend: async () => false, send: async () => 0 } as never,
      { findEnabled: async () => null } as never,
    );
    const dispatched = async (
      command: Parameters<DispatchNotificationUseCase['handle']>[0],
    ) => {
      const key = `target-check:${randomUUID()}`;
      await dispatch.handle({ ...command, idempotencyKey: key });
      const [row] = await dataSource.query<
        { target_type: string | null; target_id: string | null }[]
      >(
        `SELECT target_type, target_id FROM notifications WHERE idempotency_key = $1`,
        [key],
      );
      return row;
    };
    const explicit = await dispatched({
      userId: recipient,
      type: NotificationTypes.GIFT_REQUEST_CREATED,
      title: 'x',
      body: 'y',
      referenceType: 'GIFT_REQUEST',
      referenceId: request.global_id,
      target: { type: NotificationTargetTypes.POST, id: request.post_id },
    });
    check(
      'đích truyền rõ được ghi vào cột',
      explicit?.target_type === 'POST' &&
        explicit.target_id === request.post_id,
      JSON.stringify(explicit),
    );
    const implicit = await dispatched({
      userId: recipient,
      type: NotificationTypes.GIFT_TRANSACTION_COMPLETED,
      title: 'x',
      body: 'y',
      referenceType: 'GIFT_TRANSACTION',
      referenceId: deal.global_id,
    });
    check(
      'không truyền đích: reference là một màn thì đích chính là nó',
      implicit?.target_type === 'GIFT_TRANSACTION' &&
        implicit.target_id === deal.global_id,
      JSON.stringify(implicit),
    );
    const singleton = await dispatched({
      userId: recipient,
      type: NotificationTypes.RANK_PROMOTED,
      title: 'x',
      body: 'y',
      referenceType: 'USER_RANK',
      referenceId: recipient,
      target: { type: NotificationTargetTypes.RANK, id: null },
    });
    check(
      'màn "của tôi" ghi được với id NULL — qua được CHECK',
      singleton?.target_type === 'RANK' && singleton.target_id === null,
      JSON.stringify(singleton),
    );
    const invalid = await dispatched({
      userId: recipient,
      type: NotificationTypes.GIFT_REQUEST_CREATED,
      title: 'x',
      body: 'y',
      target: {
        type: NotificationTargetTypes.CHARITY_CAMPAIGN,
        id: contribution.campaign_id,
      },
    });
    check(
      'đích sai cặp: thông báo VẪN ghi, đích bỏ',
      invalid !== undefined && invalid.target_type === null,
      JSON.stringify(invalid),
    );

    console.log(
      '\n4. targetId trỏ tới dòng có thật, endpoint chi tiết chạy đúng',
    );
    const targets = await dataSource.query<
      { target_type: string; target_id: string }[]
    >(
      `SELECT DISTINCT target_type, target_id FROM notifications
        WHERE target_id IS NOT NULL`,
    );
    const dangling: string[] = [];
    for (const target of targets) {
      const table = TargetTables[target.target_type];
      const [{ found }] = table
        ? await dataSource.query<{ found: boolean }[]>(
            `SELECT EXISTS (SELECT 1 FROM ${table} WHERE global_id = $1) AS found`,
            [target.target_id],
          )
        : [{ found: false }];
      if (!found) dangling.push(`${target.target_type}:${target.target_id}`);
    }
    check(
      `mọi targetId (${targets.length} đích) trỏ tới một dòng có thật đúng bảng`,
      dangling.length === 0 && targets.length >= 6,
      dangling.join(', '),
    );

    const reports = new ReportRepository(
      entities.ReportEntity as never,
      dataSource.manager,
      new PointLedgerRepository(dataSource.manager),
      new AdminConfigRepository(dataSource.manager),
    );
    const commentLocation = await reports.findContentLocation(
      'COMMENT' as never,
      comment.global_id,
    );
    const messageLocation = await reports.findContentLocation(
      'CHAT_MESSAGE' as never,
      message.global_id,
    );
    check(
      'findContentLocation: bình luận → bài, tin nhắn → phòng',
      commentLocation?.type === 'POST' &&
        commentLocation.id === comment.subject_id &&
        messageLocation?.type === 'CHAT_ROOM' &&
        messageLocation.id === message.room_id,
      JSON.stringify([commentLocation, messageLocation]),
    );

    // GET /requests/:requestId
    // findDetail chỉ đọc: hai cộng tác viên ghi (chat, sổ điểm) không được chạm tới.
    const requests = new GiftRequestRepository(
      entities.GiftRequestEntity as never,
      dataSource.manager,
      {} as never,
      {} as never,
    );
    const detail = await requests.findDetail(request.global_id);
    const [owner] = await dataSource.query<{ author_id: string }[]>(
      `SELECT author_id FROM posts WHERE global_id = $1`,
      [request.post_id],
    );
    check(
      'findDetail trả bài và đúng chủ bài',
      detail?.postId === request.post_id && detail.ownerId === owner?.author_id,
      JSON.stringify(detail),
    );
    const [withDeal] = await dataSource.query<
      { request_id: string; deal_id: string }[]
    >(
      `SELECT request.global_id AS request_id, deal.global_id AS deal_id
         FROM gift_requests request
         INNER JOIN gift_transactions deal
           ON deal.post_id = request.post_id
          AND (deal.receiver_id = request.requester_id
               OR deal.giver_id = request.requester_id)
        LIMIT 1`,
    );
    if (withDeal)
      check(
        'yêu cầu đã có lượt trao: findDetail trả đúng transactionId',
        (await requests.findDetail(withDeal.request_id))?.transactionId ===
          withDeal.deal_id,
      );
    const getRequest = new GetGiftRequestUseCase(requests);
    let strangerError = 'không ném gì';
    try {
      await getRequest.handle({
        requestId: request.global_id,
        viewerUserId: randomUUID(),
      });
    } catch (error) {
      strangerError = (error as Error).constructor.name;
    }
    check(
      'GET /requests/:id: người ngoài nhận 404 như không tồn tại',
      strangerError === 'GiftRequestNotFoundException',
      strangerError,
    );

    // GET /charity-contributions/:id
    const charity = new CharityCampaignRepository(
      dataSource.manager,
      new PointLedgerRepository(dataSource.manager),
    );
    const getContribution = new GetCharityContributionUseCase(charity);
    const [contributor] = await dataSource.query<{ contributor_id: string }[]>(
      `SELECT contributor_id FROM campaign_contributions WHERE global_id = $1`,
      [contribution.global_id],
    );
    const ownView = await getContribution.handle({
      contributionId: contribution.global_id,
      viewerUserId: contributor.contributor_id,
    });
    check(
      'GET /charity-contributions/:id: người đóng góp đọc được, có campaignId',
      ownView.campaignId === contribution.campaign_id,
    );
    let outsiderError = 'không ném gì';
    try {
      await getContribution.handle({
        contributionId: contribution.global_id,
        viewerUserId: randomUUID(),
      });
    } catch (error) {
      outsiderError = (error as Error).constructor.name;
    }
    check(
      'GET /charity-contributions/:id: người ngoài nhận 404',
      outsiderError === 'CharityContributionNotFoundException',
      outsiderError,
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'Đích thông báo: backfill suy đúng màn cha cho dữ liệu cũ, CHECK chặn cặp sai, đường ghi thật ghi đúng hai cột, và mọi targetId mở được một dòng có thật'
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
