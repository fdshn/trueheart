/**
 * Diễn đàn Phật Pháp và Hồi hướng trên Postgres THẬT (SRS UC-DHARMA-03, UC-DHARMA-04, F73
 * phần B).
 *
 * ## Điều quan trọng nhất: `SubjectGuard` vừa được VÁ, và script này canh đúng lỗ đó
 *
 * Trước 04/10, `SubjectGuard.assertExists` trả `{authorId: null}` cho MỌI loại không phải
 * `POST`. Nghĩa là thả cảm xúc hoặc bình luận vào một `DHARMA_THREAD` **không tồn tại** cũng
 * được, và `content_reactions` để lại hàng trỏ vào hư không. Lỗ đó vô hại khi chưa có chủ đề
 * nào — nay có rồi.
 *
 * Nhóm 3 bắn cảm xúc và bình luận vào một UUID bịa, vào một chủ đề đang chờ duyệt, và vào một
 * chủ đề đã khoá. Cả ba phải bị từ chối.
 *
 * ## `isLocked` là một YÊU CẦU ĐẶC TẢ, không phải phòng xa
 *
 * UC-DHARMA-03 cho Admin *"khóa bình luận"*. Khoá mà vẫn nhận bình luận thì cái nút đó không
 * làm gì, và Admin tưởng mình đã dừng được cuộc tranh luận. Nhóm 4 đo đúng điều đó, và đo cả
 * chuyện khoá KHÔNG ẩn chủ đề — vẫn đọc được, chỉ không bình luận thêm.
 *
 * ## Bốn điều khác chỉ Postgres trả lời được
 *
 * 1. **Hai con số đếm là CÂU CON**, không cột lưu sẵn — và câu đếm bình luận loại `REMOVED`.
 * 2. **Tên người hồi hướng ẩn danh không ra khỏi SQL** — soát cả chuỗi JSON, cùng lối đã bắt
 *    được lỗi "hai lớp che nhau" ở Sổ vàng Công đức.
 * 3. **`reports` nhận `DHARMA_THREAD`** sau lượt dựng lại enum.
 * 4. **Bộ lọc từ ngữ đẩy chủ đề vào `PENDING_REVIEW`** và chủ đề đó không lọt đường công khai.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import {
  CreateDedicationUseCase,
  CreateThreadUseCase,
  GetThreadUseCase,
  ListAdminThreadsUseCase,
  ListOwnDedicationsUseCase,
  ListPublicDedicationsUseCase,
  ListPublicThreadsUseCase,
  ModerateThreadUseCase,
} from '../src/application/implementations/dharma/dharma-forum.use-cases';
import { CreateCommentUseCase } from '../src/application/implementations/feed/content-comment.use-cases';
import { SetContentReactionUseCase } from '../src/application/implementations/feed/content-reaction.use-cases';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { ContentCommentRepository } from '../src/infrastructure/repository/content-comment.repository';
import { ContentReactionRepository } from '../src/infrastructure/repository/content-reaction.repository';
import { DharmaRepository } from '../src/infrastructure/repository/dharma.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_dharma_forum_check';

const AdminId = 'a2000000-0000-4000-8000-0000000000ad';
const AuthorId = 'a2000000-0000-4000-8000-0000000000a1';
const AnonId = 'a2000000-0000-4000-8000-0000000000a2';
const OtherId = 'a2000000-0000-4000-8000-0000000000ff';

/** Tên THẬT của người hồi hướng ẩn danh. Không chuỗi nào trong response được chứa nó. */
const AnonRealName = 'Lê Thị Giấu Tên';

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
  expectedName: string,
): Promise<void> {
  try {
    await run();
    check(label, false, 'không ném gì');
  } catch (error) {
    const name = (error as Error).constructor.name;
    check(label, name === expectedName, `ném ${name}`);
  }
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
    check(label, message.includes(fragment), message.slice(0, 110));
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

  try {
    const repository = new DharmaRepository(dataSource.manager);
    const adminConfig = new AdminConfigRepository(dataSource.manager);

    const createThread = new CreateThreadUseCase(repository, adminConfig);
    const listThreads = new ListPublicThreadsUseCase(repository);
    const getThread = new GetThreadUseCase(repository);
    const listAdminThreads = new ListAdminThreadsUseCase(
      repository,
      adminConfig,
    );
    const moderate = new ModerateThreadUseCase(repository, adminConfig);
    const createDedication = new CreateDedicationUseCase(repository);
    const listPublicDedications = new ListPublicDedicationsUseCase(repository);
    const listOwnDedications = new ListOwnDedicationsUseCase(repository);

    // Hai use case THAT cua cam xuc va binh luan -- day la thu kiem `SubjectGuard`.
    //
    // Stub chi cho phan khong lien quan den cau hoi dang kiem: entitlement luon cho phep,
    // throttle luon qua, thong bao va diem khong lam gi. Neu stub ca `IDharmaRepository`
    // thi phep kiem khong con y nghia -- no phai la repository THAT.
    const allowAll = {
      getCapability: async () => ({ allowed: true, limit: null }),
    } as never;
    const noop = { handle: async () => undefined } as never;
    const freeThrottle = {
      assertWithinLimit: async () => undefined,
      registerHit: async () => undefined,
    } as never;

    const reactUseCase = new SetContentReactionUseCase(
      new ContentReactionRepository(dataSource.manager) as never,
      allowAll,
      { findOneBy: async () => null } as never,
      repository,
      noop,
      noop,
    );
    const commentUseCase = new CreateCommentUseCase(
      new ContentCommentRepository(dataSource.manager) as never,
      allowAll,
      { findOneBy: async () => null } as never,
      repository,
      adminConfig,
      { confirmCommentMediaUpload: async () => undefined } as never,
      noop,
      freeThrottle,
      noop,
    );

    for (const [id, username, fullName] of [
      [AdminId, 'quantri', 'Quản Trị Viên'],
      [AuthorId, 'tacgia', 'Nguyễn Văn Tác Giả'],
      [AnonId, 'giauten', AnonRealName],
      [OtherId, 'nguoikhac', 'Người Khác'],
    ])
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status, full_name)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE', $3)`,
        [id, username, fullName],
      );
    await dataSource.query(
      `INSERT INTO admin_user_roles (user_id, role_id)
       SELECT $1, id FROM admin_roles WHERE code = 'SUPER_ADMIN'`,
      [AdminId],
    );

    console.log('1. Tạo chủ đề và bộ lọc từ ngữ dùng chung');

    check(
      'SUPER_ADMIN có post.moderate — quyền kiểm duyệt dùng LẠI, không mã mới',
      await adminConfig.hasPermission(AdminId, 'post.moderate'),
    );

    const clean = await createThread.handle({
      actorUserId: AuthorId,
      title: 'Hỏi về pháp môn niệm Phật',
      bodyText: 'Xin quý vị chỉ giúp cách hành trì niệm Phật cho người mới.',
      category: 'Hỏi Đáp Giáo Lý',
    });
    check(
      'chủ đề sạch vào thẳng VISIBLE',
      clean.thread.status === 'VISIBLE' && clean.thread.flaggedTerms === null,
      clean.thread.status,
    );
    check(
      'danh mục chuẩn hoá về slug',
      clean.thread.category === 'hoi-dap-giao-ly',
      String(clean.thread.category),
    );
    check(
      'chủ đề mới: hai con số đếm đều 0',
      clean.thread.commentCount === 0 && clean.thread.reactionCount === 0,
    );
    check(
      'hai con số đếm là SỐ, không phải chuỗi (count(*) về dạng chuỗi)',
      typeof clean.thread.commentCount === 'number' &&
        typeof clean.thread.reactionCount === 'number',
    );
    await expectThrow(
      'chủ đề quá ngắn bị từ chối',
      () =>
        createThread.handle({
          actorUserId: AuthorId,
          title: 'Hỏi',
          bodyText: 'ngắn',
        }),
      'ValidationFailedException',
    );

    // Nạp một từ vào bộ lọc rồi tạo chủ đề chứa nó. Dùng ĐÚNG khoá cấu hình của bình luận.
    // Publish một bản MỚI của danh sách từ khoá.
    //
    // KHÔNG ghi `version: 1` — migration `1795600000000` và `1796000000000` đã seed sẵn,
    // và `UQ_system_configs_key_version` chặn. Bản đang hiệu lực là bản có `version` CAO
    // NHẤT với `effective_from <= now()`, nên cộng một vào bản cao nhất đang có.
    // ĐÓNG bản đang hiệu lực TRƯỚC khi mở bản mới.
    //
    // `EX_system_configs_published_window` cấm hai bản PUBLISHED cùng khoá có khung thời gian
    // trùng nhau — đúng kỷ luật copy-on-write của `system_configs`. Hai câu, không một.
    // Khoảng nửa mở `[)` nên `effective_to = now()` của bản cũ và `effective_from = now()`
    // của bản mới không chồng nhau.
    const closedAt = new Date();
    await dataSource.query(
      `UPDATE system_configs
          SET effective_to = $1
        WHERE config_key = 'moderation.blocked_terms' AND effective_to IS NULL`,
      [closedAt],
    );
    await dataSource.query(
      `INSERT INTO system_configs
         (config_key, value_json, value_type, version, effective_from, updated_by)
       SELECT 'moderation.blocked_terms', $1::jsonb, 'JSON',
              COALESCE(MAX(version), 0) + 1, $3, $2
         FROM system_configs
        WHERE config_key = 'moderation.blocked_terms'`,
      [
        // Khoá là `severity`, không phải `action` — và mặc định là `BLOCK`, nên gõ sai tên
        // khoá thì mục cấm thành chặn thẳng. Đó là lối fail-closed đúng, và tôi đã mắc nó
        // một lượt khi viết phép kiểm này.
        JSON.stringify([{ term: 'luadao', severity: 'REVIEW' }]),
        AdminId,
        closedAt,
      ],
    );
    const flagged = await createThread.handle({
      actorUserId: AuthorId,
      title: 'Cẩn thận chuyện luadao trong nhóm',
      bodyText: 'Tôi muốn nói về chuyện luadao gần đây để mọi người biết.',
    });
    check(
      'chủ đề bị bộ lọc gắn cờ vào PENDING_REVIEW, không hiện ngay',
      flagged.thread.status === 'PENDING_REVIEW' &&
        flagged.thread.flaggedTerms !== null,
      `${flagged.thread.status}/${String(flagged.thread.flaggedTerms)}`,
    );
    check(
      'chủ đề PENDING_REVIEW KHÔNG lọt danh sách công khai',
      !(await listThreads.handle({ limit: 50, offset: 0 })).items.some(
        (item) => item.globalId === flagged.thread.globalId,
      ),
    );
    await expectThrow(
      'đọc chủ đề PENDING_REVIEW qua đường công khai -> NotFound',
      () => getThread.handle({ threadId: flagged.thread.globalId }),
      'DharmaThreadNotFoundException',
    );
    check(
      'Admin THẤY nó trong hàng đợi kiểm duyệt',
      (
        await listAdminThreads.handle({
          actorUserId: AdminId,
          limit: 50,
          offset: 0,
          status: 'PENDING_REVIEW',
        })
      ).items.some((item) => item.globalId === flagged.thread.globalId),
    );
    await expectThrow(
      'người không có post.moderate mở hàng đợi -> Forbidden',
      () =>
        listAdminThreads.handle({
          actorUserId: OtherId,
          limit: 10,
          offset: 0,
        }),
      'ForbiddenException',
    );

    console.log(
      '\n2. Thích và bình luận dùng bảng CÓ SẴN, không migration nào',
    );

    // Chèn thẳng để chứng minh enum đã nhận `DHARMA_THREAD` từ trước.
    await dataSource.query(
      `INSERT INTO content_reactions (subject_type, subject_id, user_id, kind)
       VALUES ('DHARMA_THREAD', $1, $2, 'LIKE')`,
      [clean.thread.globalId, OtherId],
    );
    await dataSource.query(
      `INSERT INTO content_comments
         (global_id, subject_type, subject_id, author_id, body, status, depth)
       VALUES (gen_random_uuid(), 'DHARMA_THREAD', $1, $2, 'Xin tùy hỷ.', 'VISIBLE', 1)`,
      [clean.thread.globalId, OtherId],
    );
    const counted = await repository.findThreadByGlobalId(
      clean.thread.globalId,
    );
    check(
      'hai con số ĐẾM từ bảng có sẵn, không cần cột lưu sẵn',
      counted?.commentCount === 1 && counted?.reactionCount === 1,
      `comment=${counted?.commentCount} reaction=${counted?.reactionCount}`,
    );

    // Bình luận đã GỠ không được đếm — đếm nó vào là nói "2 câu trả lời" trong khi người
    // đọc chỉ thấy 1.
    await dataSource.query(
      `INSERT INTO content_comments
         (global_id, subject_type, subject_id, author_id, body, status, depth)
       VALUES (gen_random_uuid(), 'DHARMA_THREAD', $1, $2, 'Câu đã gỡ.', 'REMOVED', 1)`,
      [clean.thread.globalId, OtherId],
    );
    check(
      'bình luận REMOVED KHÔNG được đếm',
      (await repository.findThreadByGlobalId(clean.thread.globalId))
        ?.commentCount === 1,
    );
    check(
      'bảng dharma_threads KHÔNG có cột đếm nào',
      (
        await dataSource.query<{ total: string }[]>(
          `SELECT count(*)::text AS total FROM information_schema.columns
            WHERE table_name = 'dharma_threads'
              AND column_name IN ('comment_count', 'reaction_count')`,
        )
      )[0].total === '0',
    );

    console.log('\n3. SubjectGuard — lỗ hổng đã vá, và đây là phép đo nó');

    // Trước 04/10, `SubjectGuard.assertExists` trả `{authorId: null}` cho MỌI loại không
    // phải POST — nên ba lượt dưới đây ĐỀU ĐI QUA, và để lại hàng trỏ vào hư không.
    const GhostThread = '00000000-0000-4000-8000-00000000dead';

    await expectThrow(
      'thả cảm xúc vào chủ đề KHÔNG TỒN TẠI -> bị từ chối',
      () =>
        reactUseCase.handle({
          userId: OtherId,
          subjectType: 'DHARMA_THREAD',
          subjectId: GhostThread,
          kind: 'LIKE',
        } as never),
      'DharmaThreadNotFoundException',
    );
    await expectThrow(
      'bình luận vào chủ đề KHÔNG TỒN TẠI -> bị từ chối',
      () =>
        commentUseCase.handle({
          userId: OtherId,
          subjectType: 'DHARMA_THREAD',
          subjectId: GhostThread,
          body: 'Bình luận vào hư không.',
        } as never),
      'DharmaThreadNotFoundException',
    );
    await expectThrow(
      'bình luận vào chủ đề đang CHỜ DUYỆT -> bị từ chối',
      () =>
        commentUseCase.handle({
          userId: OtherId,
          subjectType: 'DHARMA_THREAD',
          subjectId: flagged.thread.globalId,
          body: 'Bình luận vào chủ đề chưa duyệt.',
        } as never),
      'DharmaThreadNotFoundException',
    );

    // Và đường HỢP LỆ phải đi qua — nếu không thì ba dòng trên chỉ chứng minh mọi lượt đều
    // bị chặn, tức không chứng minh gì.
    const realComment = await commentUseCase.handle({
      userId: OtherId,
      subjectType: 'DHARMA_THREAD',
      subjectId: clean.thread.globalId,
      body: 'Bình luận hợp lệ vào chủ đề đang hiện.',
    } as never);
    check(
      'đường HỢP LỆ vẫn đi qua — bình luận vào chủ đề đang hiện',
      realComment !== undefined,
    );

    console.log('\n3b. reports nhận DHARMA_THREAD sau lượt dựng lại enum');

    check(
      'enum reports_target_type_enum có DHARMA_THREAD',
      (
        await dataSource.query<{ labels: string }[]>(
          `SELECT string_agg(enumlabel, ',' ORDER BY enumlabel) AS labels
             FROM pg_enum
            WHERE enumtypid = 'reports_target_type_enum'::regtype`,
        )
      )[0].labels === 'CHAT_MESSAGE,COMMENT,DHARMA_THREAD,POST,USER',
      (
        await dataSource.query<{ labels: string }[]>(
          `SELECT string_agg(enumlabel, ',' ORDER BY enumlabel) AS labels
             FROM pg_enum WHERE enumtypid = 'reports_target_type_enum'::regtype`,
        )
      )[0].labels,
    );
    await dataSource.query(
      `INSERT INTO reports
         (global_id, reporter_user_id, target_type, target_id, reason, description,
          status)
       VALUES (gen_random_uuid(), $1, 'DHARMA_THREAD', $2, 'INAPPROPRIATE_CONTENT',
               'Chu de co noi dung khong phu hop.', 'PENDING')`,
      [OtherId, clean.thread.globalId],
    );
    check(
      'báo xấu một chủ đề lưu được, chung hàng đợi với bài và bình luận',
      (
        await dataSource.query<{ total: string }[]>(
          `SELECT count(*)::text AS total FROM reports
            WHERE target_type = 'DHARMA_THREAD'`,
        )
      )[0].total === '1',
    );

    console.log('\n4. Kiểm duyệt: khoá bình luận KHÔNG ẩn chủ đề');

    const locked = await moderate.handle({
      actorUserId: AdminId,
      threadId: clean.thread.globalId,
      isLocked: true,
      note: 'Tranh luận chệch hướng.',
    });
    check(
      'khoá bình luận mà GIỮ trạng thái VISIBLE',
      locked.thread.isLocked && locked.thread.status === 'VISIBLE',
      `${locked.thread.status}/locked=${locked.thread.isLocked}`,
    );
    check(
      'chủ đề đã khoá VẪN đọc được qua đường công khai',
      (await getThread.handle({ threadId: clean.thread.globalId })).thread
        .globalId === clean.thread.globalId,
    );
    // UC-DHARMA-03 cho Admin "khoá bình luận". Khoá mà vẫn nhận bình luận thì cái nút đó
    // không làm gì, và Admin tưởng mình đã dừng được cuộc tranh luận.
    await expectThrow(
      'bình luận vào chủ đề ĐÃ KHOÁ -> bị từ chối',
      () =>
        commentUseCase.handle({
          userId: OtherId,
          subjectType: 'DHARMA_THREAD',
          subjectId: clean.thread.globalId,
          body: 'Cố bình luận sau khi đã khoá.',
        } as never),
      'DharmaThreadLockedException',
    );
    check(
      'thả cảm xúc vào chủ đề đã khoá thì VẪN được — khoá là khoá BÌNH LUẬN',
      (await reactUseCase.handle({
        userId: AnonId,
        subjectType: 'DHARMA_THREAD',
        subjectId: clean.thread.globalId,
        kind: 'LOVE',
      } as never)) !== undefined,
    );
    check(
      'lượt kiểm duyệt ghi dấu vết ai và khi nào',
      locked.thread.moderatedBy === AdminId &&
        locked.thread.moderatedAt !== null &&
        locked.thread.moderationNote === 'Tranh luận chệch hướng.',
    );
    await expectThrow(
      'gọi kiểm duyệt mà KHÔNG gửi thay đổi nào -> từ chối, không ghi dấu vết rỗng',
      () =>
        moderate.handle({
          actorUserId: AdminId,
          threadId: clean.thread.globalId,
          note: 'chỉ ghi chú',
        }),
      'ValidationFailedException',
    );

    const pinned = await moderate.handle({
      actorUserId: AdminId,
      threadId: flagged.thread.globalId,
      status: 'VISIBLE',
      isPinned: true,
      note: 'Duyệt và ghim.',
    });
    check(
      'duyệt + ghim trong MỘT lượt',
      pinned.thread.status === 'VISIBLE' && pinned.thread.isPinned,
    );
    const pinnedFirst = await listThreads.handle({ limit: 50, offset: 0 });
    check(
      'chủ đề ghim nằm ĐẦU danh sách công khai',
      pinnedFirst.items[0]?.globalId === flagged.thread.globalId,
      String(pinnedFirst.items[0]?.title),
    );

    const hidden = await moderate.handle({
      actorUserId: AdminId,
      threadId: flagged.thread.globalId,
      status: 'HIDDEN',
      note: 'Ẩn sau khi xem lại.',
    });
    check(
      'ẩn chủ đề -> rời khỏi danh sách công khai',
      hidden.thread.status === 'HIDDEN' &&
        !(await listThreads.handle({ limit: 50, offset: 0 })).items.some(
          (item) => item.globalId === flagged.thread.globalId,
        ),
    );
    await expectThrow(
      'kiểm duyệt chủ đề không tồn tại -> NotFound',
      () =>
        moderate.handle({
          actorUserId: AdminId,
          threadId: '00000000-0000-4000-8000-000000000000',
          isPinned: true,
        }),
      'DharmaThreadNotFoundException',
    );

    console.log('\n5. Hồi hướng — LỜI, không phải TIỀN');

    const named = await createDedication.handle({
      actorUserId: AuthorId,
      text: 'Nguyện hồi hướng công đức này cho cha mẹ được an lành.',
      dedicateeName: 'Cha mẹ',
    });
    check(
      'lời hồi hướng lưu được, mặc định CÔNG KHAI và KHÔNG ẩn danh',
      named.dedication.isPublic && !named.dedication.isAnonymous,
    );
    check(
      'không gắn lượt tụng thì recitationId là null (tạo độc lập)',
      named.dedication.recitationId === null,
    );

    const noName = await createDedication.handle({
      actorUserId: AuthorId,
      text: 'Nguyện hồi hướng cho tất cả chúng sinh.',
    });
    check(
      'KHÔNG đòi dedicateeName — hồi hướng cho tất cả chúng sinh không có tên người nhận',
      noName.dedication.dedicateeName === null,
    );
    await expectThrow(
      'lời quá ngắn bị từ chối',
      () => createDedication.handle({ actorUserId: AuthorId, text: 'abc' }),
      'ValidationFailedException',
    );

    // Gắn với một lượt tụng — và lượt đó phải CỦA CHÍNH NGƯỜI NÀY.
    const [sutra] = await dataSource.query<{ global_id: string }[]>(
      `INSERT INTO dharma_contents
         (content_type, title, slug, body_text, is_published, published_at)
       VALUES ('SUTRA', 'Kinh thử', 'kinh-thu', 'Như thị ngã văn.', true, now())
       RETURNING global_id`,
    );
    const myRecitation = await repository.startRecitation({
      contentId: sutra.global_id,
      userId: AuthorId,
    });
    const linked = await createDedication.handle({
      actorUserId: AuthorId,
      text: 'Hồi hướng công đức tụng kinh hôm nay.',
      recitationId: myRecitation.globalId,
    });
    check(
      'gắn được với lượt tụng của chính mình',
      linked.dedication.recitationId === myRecitation.globalId,
    );
    await expectThrow(
      'gắn vào lượt tụng của NGƯỜI KHÁC -> NotFound (không tiết lộ là của ai)',
      () =>
        createDedication.handle({
          actorUserId: OtherId,
          text: 'Mượn lượt tụng của người khác.',
          recitationId: myRecitation.globalId,
        }),
      'DharmaRecitationNotFoundException',
    );

    console.log('\n6. ẨN DANH — tên thật KHÔNG ra khỏi SQL');

    await createDedication.handle({
      actorUserId: AnonId,
      text: 'Nguyện hồi hướng, xin được ẩn danh.',
      isAnonymous: true,
    });
    const notPublic = await createDedication.handle({
      actorUserId: AnonId,
      text: 'Lời này chỉ mình tôi thấy.',
      isPublic: false,
    });

    const publicList = await listPublicDedications.handle({
      limit: 50,
      offset: 0,
    });
    check(
      'hàng ẩn danh hiện "Người ẩn danh"',
      publicList.items.some((item) => item.dedicatorLabel === 'Người ẩn danh'),
    );
    check(
      'hàng KHÔNG ẩn danh hiện tên thật',
      publicList.items.some(
        (item) => item.dedicatorLabel === 'Nguyễn Văn Tác Giả',
      ),
    );
    // Phép kiểm quan trọng nhất của nhóm này: soát TOÀN BỘ chuỗi JSON.
    check(
      'TOÀN BỘ danh sách công khai KHÔNG chứa tên thật của người ẩn danh',
      !JSON.stringify(publicList).includes(AnonRealName),
      JSON.stringify(publicList).includes(AnonRealName) ? 'LỘ TÊN' : 'sạch',
    );
    check(
      'hàng isPublic=false KHÔNG lọt danh sách công khai',
      !publicList.items.some(
        (item) => item.globalId === notPublic.dedication.globalId,
      ),
    );

    const own = await listOwnDedications.handle({
      actorUserId: AnonId,
      limit: 50,
      offset: 0,
    });
    check(
      'chính người đó xem lại được CẢ hàng ẩn danh và hàng không công khai',
      own.total === 2,
      `total=${own.total}`,
    );
    check(
      'hàng ẩn danh vẫn giữ user_id trong database — ẩn TÊN, không xoá dữ liệu',
      own.items.every((item) => item.userId === AnonId),
    );

    console.log('\n7. Ràng buộc database — lớp cuối chặn SQL tay');

    await expectReject(
      'trạng thái chủ đề ngoài allowlist bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO dharma_threads (author_id, title, body_text, status)
           VALUES ($1, 'Tiêu đề thử', 'Nội dung đủ mười ký tự.', 'LOCKED')`,
          [AuthorId],
        ),
      'CHK_dharma_threads_status',
    );
    await expectReject(
      'tiêu đề quá ngắn bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO dharma_threads (author_id, title, body_text)
           VALUES ($1, 'Hỏi', 'Nội dung đủ mười ký tự.')`,
          [AuthorId],
        ),
      'CHK_dharma_threads_title',
    );
    await expectReject(
      'nội dung quá ngắn bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO dharma_threads (author_id, title, body_text)
           VALUES ($1, 'Tiêu đề thử', 'ngắn')`,
          [AuthorId],
        ),
      'CHK_dharma_threads_body',
    );
    await expectReject(
      'danh mục sai dạng slug bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO dharma_threads (author_id, title, body_text, category)
           VALUES ($1, 'Tiêu đề thử', 'Nội dung đủ mười ký tự.', 'Hỏi Đáp')`,
          [AuthorId],
        ),
      'CHK_dharma_threads_category_shape',
    );
    await expectReject(
      'ghi moderated_by mà thiếu moderated_at bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO dharma_threads (author_id, title, body_text, moderated_by)
           VALUES ($1, 'Tiêu đề thử', 'Nội dung đủ mười ký tự.', $2)`,
          [AuthorId, AdminId],
        ),
      'CHK_dharma_threads_moderated',
    );
    await expectReject(
      'lời hồi hướng quá ngắn bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO dharma_dedications (user_id, text) VALUES ($1, 'abc')`,
          [AuthorId],
        ),
      'CHK_dharma_dedications_text',
    );
    await expectReject(
      'dedicatee_name chỉ gồm dấu cách bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO dharma_dedications (user_id, text, dedicatee_name)
           VALUES ($1, 'Nguyện hồi hướng cho người thân.', '   ')`,
          [AuthorId],
        ),
      'CHK_dharma_dedications_dedicatee',
    );

    console.log('\n8. Xoá tài khoản tác giả KHÔNG xoá chủ đề');

    await dataSource.query(`DELETE FROM users WHERE global_id = $1`, [
      AuthorId,
    ]);
    const orphan = await repository.findThreadByGlobalId(clean.thread.globalId);
    check(
      'chủ đề còn lại cho người khác đọc, chỉ mất tên tác giả',
      orphan !== null && orphan.authorId === null,
      `authorId=${String(orphan?.authorId)}`,
    );
    check(
      'bình luận của người khác dưới chủ đề đó vẫn còn',
      // HAI: một chèn thẳng ở nhóm 2, một qua use case thật ở nhóm 3. Hàng `REMOVED` không
      // tính — đó đúng là điều nhóm 2 đã đo.
      orphan?.commentCount === 2,
      `comment=${orphan?.commentCount}`,
    );
    check(
      'lời hồi hướng của người đã xoá tài khoản thì đi theo (ON DELETE CASCADE)',
      (
        await dataSource.query<{ total: string }[]>(
          `SELECT count(*)::text AS total FROM dharma_dedications WHERE user_id = $1`,
          [AuthorId],
        )
      )[0].total === '0',
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'F73 Diễn đàn + Hồi hướng: bộ lọc từ ngữ dùng CHUNG với bình luận và chủ đề bị gắn cờ không lọt đường công khai, thích/bình luận dùng bảng có sẵn với enum đã sẵn DHARMA_THREAD, bình luận REMOVED không được đếm, reports nhận đích mới, khoá bình luận KHÔNG ẩn chủ đề, một lượt kiểm duyệt ghi một dấu vết và lượt gọi rỗng bị từ chối, tên người hồi hướng ẩn danh không xuất hiện ở đâu trong response nhưng chính họ xem lại được, bảy ràng buộc database chặn đúng, và xoá tài khoản tác giả không xoá chủ đề'
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
