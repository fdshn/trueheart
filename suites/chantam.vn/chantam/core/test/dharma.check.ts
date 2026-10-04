/**
 * Phật Pháp: engine nội dung và tụng kinh, trên Postgres THẬT (SRS UC-DHARMA-01,
 * UC-DHARMA-02, BR-DHARMA-01, F73).
 *
 * ## Sáu điều chỉ Postgres trả lời được
 *
 * 1. **`duration_seconds` tính Ở DATABASE.** Một con số do client gửi là con số người dùng
 *    sửa được. Nhóm 4 chờ thật rồi đo khoảng cách — mock không kiểm được một biểu thức SQL.
 * 2. **`published_at` GIỮ mốc cũ khi sửa tiếp bản đã công khai.** Đó là một biểu thức `CASE`
 *    trong câu `UPDATE`, không phải một nhánh `if` nào.
 * 3. **`CHK_dharma_contents_published_has_body`** chặn một bộ kinh CÔNG KHAI mà rỗng.
 * 4. **`incrementViewCount` KHÔNG đụng `updated_at`** — nếu đụng thì mọi bộ kinh đọc nhiều
 *    luôn hiện "vừa cập nhật", và Admin mất cách biết bản nào thật sự được sửa.
 * 5. **Câu đếm và câu đọc của danh sách dùng chung bộ lọc.** Lệch nhau là người dùng thấy
 *    "48 bộ kinh" rồi nhận 12 hàng.
 * 6. **Slug đã xoá mềm VẪN giữ chỗ** — cột `UNIQUE` không biết `deleted_at`.
 *
 * ## Đã chứng minh script này thật sự kiểm — và hai chỗ nó KHÔNG kiểm được
 *
 * Phá ba mệnh đề chịu lực rồi chạy lại:
 *
 * - Bỏ `COALESCE(published_at, now())` → *"xuất bản LẠI bản đã công khai"* ĐỎ. **Bản đầu của
 *   nhóm 5 không bắt được nó**: nó chỉ sửa `summary`, nên nhánh `is_published` không hề chạy
 *   và phép kiểm xanh một cách vô nghĩa. Đã thêm một lượt gửi lại `isPublished: true`.
 * - Thêm `updated_at = now()` vào lượt tăng `view_count` → ĐỎ ngay.
 * - Đổi `SummaryColumns` thành `FullColumns` → **KHÔNG đỏ.** Xem ghi chú trong nhóm 3: đây là
 *   giới hạn đã biết của script, không phải một điều nó bảo đảm.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import {
  CompleteRecitationUseCase,
  CreateDharmaContentUseCase,
  DeleteDharmaContentUseCase,
  GetDharmaContentUseCase,
  GetDharmaHubUseCase,
  ListAdminDharmaContentsUseCase,
  ListOwnRecitationsUseCase,
  ListPublicDharmaContentsUseCase,
  StartRecitationUseCase,
  UpdateDharmaContentUseCase,
} from '../src/application/implementations/dharma/dharma.use-cases';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { DharmaRepository } from '../src/infrastructure/repository/dharma.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_dharma_check';

const AdminId = 'f1000000-0000-4000-8000-0000000000ad';
const ReciterId = 'f1000000-0000-4000-8000-0000000000c1';
const OtherId = 'f1000000-0000-4000-8000-0000000000c2';

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

function sutraInput(overrides: Record<string, unknown> = {}) {
  return {
    contentType: 'SUTRA',
    category: 'Kinh Đại Thừa',
    title: 'Kinh Địa Tạng Bồ Tát Bổn Nguyện',
    bodyText: 'Nam mô A Di Đà Phật. '.repeat(20),
    isPublished: true,
    ...overrides,
  };
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

    const createUseCase = new CreateDharmaContentUseCase(
      repository,
      adminConfig,
    );
    const updateUseCase = new UpdateDharmaContentUseCase(
      repository,
      adminConfig,
    );
    const listPublicUseCase = new ListPublicDharmaContentsUseCase(repository);
    const listAdminUseCase = new ListAdminDharmaContentsUseCase(
      repository,
      adminConfig,
    );
    const getUseCase = new GetDharmaContentUseCase(repository);
    const deleteUseCase = new DeleteDharmaContentUseCase(
      repository,
      adminConfig,
    );
    const startUseCase = new StartRecitationUseCase(repository);
    const completeUseCase = new CompleteRecitationUseCase(repository);
    const listOwnUseCase = new ListOwnRecitationsUseCase(repository);
    const hubUseCase = new GetDharmaHubUseCase(repository);

    for (const [id, username] of [
      [AdminId, 'quantri'],
      [ReciterId, 'phattu'],
      [OtherId, 'nguoikhac'],
    ])
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, username],
      );
    await dataSource.query(
      `INSERT INTO admin_user_roles (user_id, role_id)
       SELECT $1, id FROM admin_roles WHERE code = 'SUPER_ADMIN'`,
      [AdminId],
    );

    console.log('1. Quyền dharma.* phải thực sự được seed');

    check(
      'SUPER_ADMIN có dharma.manage (migration 1799000000000 cấp tay)',
      await adminConfig.hasPermission(AdminId, 'dharma.manage'),
    );
    check(
      'CAMPAIGN_MANAGER có cả dharma.read và dharma.manage',
      (
        await dataSource.query<{ codes: string }[]>(
          `SELECT coalesce(string_agg(permission.code, ',' ORDER BY permission.code), '') AS codes
             FROM admin_role_permissions link
             JOIN admin_roles role ON role.id = link.role_id
             JOIN admin_permissions permission ON permission.id = link.permission_id
            WHERE role.code = 'CAMPAIGN_MANAGER' AND permission.code LIKE 'dharma.%'`,
        )
      )[0].codes === 'dharma.manage,dharma.read',
    );
    check(
      'AUDITOR chỉ có dharma.read',
      (
        await dataSource.query<{ codes: string }[]>(
          `SELECT coalesce(string_agg(permission.code, ',' ORDER BY permission.code), '') AS codes
             FROM admin_role_permissions link
             JOIN admin_roles role ON role.id = link.role_id
             JOIN admin_permissions permission ON permission.id = link.permission_id
            WHERE role.code = 'AUDITOR' AND permission.code LIKE 'dharma.%'`,
        )
      )[0].codes === 'dharma.read',
    );
    await expectThrow(
      'người không có quyền soạn nội dung -> ForbiddenException',
      () => createUseCase.handle({ ...sutraInput(), actorUserId: OtherId }),
      'ForbiddenException',
    );

    console.log('\n2. Engine dùng chung cho ba loại nội dung (BR-DHARMA-01)');

    const sutra = await createUseCase.handle({
      ...sutraInput(),
      actorUserId: AdminId,
    });
    check(
      'slug sinh từ tiêu đề, chữ đ xử lý đúng (Địa -> dia)',
      sutra.slug === 'kinh-dia-tang-bo-tat-bon-nguyen',
      sutra.slug,
    );
    check(
      'danh mục chuẩn hoá về slug: "Kinh Đại Thừa" -> "kinh-dai-thua"',
      sutra.category === 'kinh-dai-thua',
      String(sutra.category),
    );
    check(
      'xuất bản thì có publishedAt',
      sutra.isPublished && sutra.publishedAt !== null,
    );

    const info = await createUseCase.handle({
      contentType: 'INFO',
      title: 'Giờ mở cửa chùa',
      bodyText: 'Chùa mở cửa từ 5 giờ sáng.',
      isPublished: true,
      actorUserId: AdminId,
    });
    const temple = await createUseCase.handle({
      contentType: 'TEMPLE_INTRO',
      title: 'Chùa Vĩnh Nghiêm',
      bodyText: 'Chùa toạ lạc tại Quận 3.',
      isPublished: true,
      displayOrder: 2,
      actorUserId: AdminId,
    });
    const draft = await createUseCase.handle({
      contentType: 'SUTRA',
      title: 'Kinh Pháp Hoa bản nháp',
      actorUserId: AdminId,
    });
    check(
      'ba loại nội dung nằm CÙNG một bảng',
      (
        await dataSource.query<{ total: string }[]>(
          `SELECT count(DISTINCT content_type)::text AS total FROM dharma_contents`,
        )
      )[0].total === '3',
    );
    check(
      'bản nháp lưu được dù KHÔNG có nội dung, và không có publishedAt',
      !draft.isPublished && draft.publishedAt === null && draft.bodyText === '',
    );
    await expectThrow(
      'xuất bản mà KHÔNG có nội dung bị từ chối ở use case',
      () =>
        createUseCase.handle({
          contentType: 'SUTRA',
          title: 'Kinh rỗng',
          isPublished: true,
          actorUserId: AdminId,
        }),
      'ValidationFailedException',
    );
    await expectThrow(
      'slug trùng bị từ chối với thông báo đọc được',
      () =>
        createUseCase.handle({
          ...sutraInput({ title: 'Tên khác', slug: sutra.slug }),
          actorUserId: AdminId,
        }),
      'ValidationFailedException',
    );

    console.log('\n3. Danh sách KHÔNG mang bodyText');

    // Một bản 300 nghìn ký tự. Nếu danh sách mang nội dung thì một trang 20 hàng là 6MB.
    const longBody = 'Nam mô A Di Đà Phật. '.repeat(15_000);
    const longSutra = await createUseCase.handle({
      contentType: 'SUTRA',
      title: 'Kinh rất dài',
      bodyText: longBody,
      isPublished: true,
      actorUserId: AdminId,
    });
    check(
      'bản dài lưu đủ nội dung (300 nghìn ký tự)',
      (await repository.findContentByGlobalId(longSutra.globalId))?.bodyText
        .length === longBody.length,
      `${longBody.length} ký tự`,
    );

    const page = await listPublicUseCase.handle({ limit: 50, offset: 0 });
    const longRow = page.items.find(
      (item) => item.globalId === longSutra.globalId,
    );
    check(
      'hàng trong danh sách KHÔNG có trường bodyText',
      longRow !== undefined && !('bodyText' in longRow),
      longRow ? Object.keys(longRow).join(',').slice(0, 80) : 'khong thay hang',
    );
    // ## Giới hạn ĐÃ ĐO của phép kiểm ngay trên — ghi ra thay vì để ai đó tin quá
    //
    // Dòng `'bodyText' in row` canh **hình dạng DTO**, tức thứ client nhận được. Đó là bảo
    // đảm thật và đáng canh: một trang 50 hàng mang nội dung là hàng triệu ký tự qua mạng
    // tới điện thoại người dùng.
    //
    // Nhưng nó **KHÔNG** canh được danh sách cột của câu SQL. Tôi đã thứ: đổi
    // `SummaryColumns` thành `FullColumns` trong repository, và **không phép kiểm nào đỏ** —
    // vì `toSummary` chọn từng trường nên nội dung bị bỏ ở mapper. Postgres vẫn gửi 2MB sang
    // Node, chỉ là Node ném đi.
    //
    // Tôi cũng thử một dòng đo `JSON.stringify(page).length` và đã **gỡ nó**: nó đo tải của DTO,
    // không phải tải trên dây từ database — một phép kiểm mang nhãn nói sai việc nó làm còn tệ
    // hơn không có phép kiểm nào.
    //
    // Nhận: phần "SQL không kéo body_text" là một **vấn đề hiệu năng chưa đo được** bằng script
    // này. Đo được nó cần `pg_stat_statements` hoặc một lớp đếm byte ở driver, cả hai đều
    // nặng hơn giá trị nó mang lại ở đây.
    check(
      'bản nháp KHÔNG lọt vào danh sách công khai',
      !page.items.some((item) => item.globalId === draft.globalId),
    );

    const sutraPage = await listPublicUseCase.handle({
      limit: 50,
      offset: 0,
      contentType: 'SUTRA',
    });
    check(
      'lọc theo contentType: total khớp số hàng, và mọi hàng đúng loại',
      sutraPage.total === sutraPage.items.length &&
        sutraPage.items.every((item) => item.contentType === 'SUTRA'),
      `total=${sutraPage.total} items=${sutraPage.items.length}`,
    );

    // Lọc bằng chuỗi CHƯA chuẩn hoá — use case phải chuẩn hoá trước khi truy vấn.
    const byRawCategory = await listPublicUseCase.handle({
      limit: 50,
      offset: 0,
      category: 'Kinh Đại Thừa',
    });
    check(
      'lọc danh mục bằng chuỗi có dấu vẫn ra kết quả (được chuẩn hoá trước)',
      byRawCategory.total === 1 &&
        byRawCategory.items[0].globalId === sutra.globalId,
      `total=${byRawCategory.total}`,
    );

    const pagedTotal = await listPublicUseCase.handle({ limit: 2, offset: 0 });
    const [publishedCount] = await dataSource.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM dharma_contents
        WHERE is_published AND deleted_at IS NULL`,
    );
    check(
      'total là TỔNG sau lọc, không phải số hàng của trang',
      String(pagedTotal.total) === publishedCount.total &&
        pagedTotal.items.length === 2,
      `total=${pagedTotal.total} items=${pagedTotal.items.length} thật=${publishedCount.total}`,
    );

    console.log('\n4. Tụng kinh — duration tính Ở DATABASE');

    await expectThrow(
      'tụng một bản INFO -> NotRecitable',
      () =>
        startUseCase.handle({
          actorUserId: ReciterId,
          contentId: info.globalId,
        }),
      'DharmaContentNotRecitableException',
    );
    await expectThrow(
      'tụng một bản nháp -> NotFound (chưa công khai thì sự tồn tại cũng chưa)',
      () =>
        startUseCase.handle({
          actorUserId: ReciterId,
          contentId: draft.globalId,
        }),
      'DharmaContentNotFoundException',
    );

    const started = await startUseCase.handle({
      actorUserId: ReciterId,
      contentId: sutra.globalId,
    });
    check(
      'bắt đầu tụng -> chưa có completedAt và chưa có duration',
      started.recitation.completedAt === null &&
        started.recitation.durationSeconds === null,
    );

    // Chờ THẬT hơn một giây để `duration_seconds` có giá trị đo được.
    await new Promise((resolve) => setTimeout(resolve, 1_200));

    await expectThrow(
      'người KHÁC đánh dấu hộ -> NotFound',
      () =>
        completeUseCase.handle({
          actorUserId: OtherId,
          recitationId: started.recitation.globalId,
        }),
      'DharmaRecitationNotFoundException',
    );

    const completed = await completeUseCase.handle({
      actorUserId: ReciterId,
      recitationId: started.recitation.globalId,
    });
    check(
      'đánh dấu xong -> có completedAt',
      completed.recitation.completedAt !== null,
    );
    check(
      'durationSeconds tính Ở DATABASE, ít nhất 1 giây',
      completed.recitation.durationSeconds !== null &&
        completed.recitation.durationSeconds >= 1,
      `duration=${String(completed.recitation.durationSeconds)}`,
    );
    check(
      'durationSeconds là SỐ, không phải chuỗi',
      typeof completed.recitation.durationSeconds === 'number',
      typeof completed.recitation.durationSeconds,
    );
    await expectThrow(
      'đánh dấu lần hai -> AlreadyCompleted',
      () =>
        completeUseCase.handle({
          actorUserId: ReciterId,
          recitationId: started.recitation.globalId,
        }),
      'DharmaRecitationAlreadyCompletedException',
    );

    // Tụng LẦN HAI cùng bộ kinh — phải ra hàng mới, không ghi đè hàng cũ.
    const secondRun = await startUseCase.handle({
      actorUserId: ReciterId,
      contentId: sutra.globalId,
    });
    check(
      'tụng lại cùng bộ kinh sinh hàng MỚI, giữ lịch sử',
      secondRun.recitation.globalId !== started.recitation.globalId,
    );
    const own = await listOwnUseCase.handle({
      actorUserId: ReciterId,
      limit: 10,
      offset: 0,
    });
    check(
      'lịch sử của tôi có đủ hai lượt',
      own.total === 2,
      `total=${own.total}`,
    );
    check(
      'số lượt HOÀN TẤT đếm lúc đọc, chỉ tính lượt đã xong',
      (await repository.countCompletedRecitations(sutra.globalId)) === 1,
    );
    check(
      'bảng dharma_contents KHÔNG có cột recitation_count (đếm được thì không lưu)',
      (
        await dataSource.query<{ total: string }[]>(
          `SELECT count(*)::text AS total FROM information_schema.columns
            WHERE table_name = 'dharma_contents' AND column_name = 'recitation_count'`,
        )
      )[0].total === '0',
    );

    console.log('\n5. publishedAt giữ mốc cũ, viewCount không đụng updatedAt');

    const firstPublishedAt = sutra.publishedAt;
    await new Promise((resolve) => setTimeout(resolve, 50));
    const edited = await updateUseCase.handle({
      actorUserId: AdminId,
      contentId: sutra.globalId,
      summary: 'Thêm phần tóm tắt',
    });
    check(
      'sửa một trường KHÁC không đụng publishedAt',
      edited.publishedAt?.getTime() === firstPublishedAt?.getTime(),
      `${String(edited.publishedAt?.toISOString())} vs ${String(firstPublishedAt?.toISOString())}`,
    );

    // GỬI LẠI `isPublished: true` cho một bản ĐÃ công khai.
    //
    // Đây mới là phép kiểm đụng tới `COALESCE(published_at, now())`. Phép kiểm ngay trên chỉ
    // sửa `summary`, nên nhánh `is_published` **không hề chạy** — nó xanh một cách vô nghĩa. Tôi
    // phá `COALESCE` thành `now()` và nó vẫn xanh, nên phải thêm dòng này.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const republished = await updateUseCase.handle({
      actorUserId: AdminId,
      contentId: sutra.globalId,
      isPublished: true,
    });
    check(
      'xuất bản LẠI bản đã công khai GIỮ NGUYÊN mốc đầu tiên',
      republished.publishedAt?.getTime() === firstPublishedAt?.getTime(),
      `${String(republished.publishedAt?.toISOString())} vs ${String(firstPublishedAt?.toISOString())}`,
    );

    const beforeView = await repository.findContentByGlobalId(sutra.globalId);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await getUseCase.handle({ idOrSlug: sutra.slug });
    const afterView = await repository.findContentByGlobalId(sutra.globalId);
    check(
      'đọc chi tiết tăng viewCount',
      (afterView?.viewCount ?? 0) === (beforeView?.viewCount ?? 0) + 1,
      `${beforeView?.viewCount} -> ${afterView?.viewCount}`,
    );
    check(
      'tăng viewCount KHÔNG đụng updatedAt',
      afterView?.updatedAt.getTime() === beforeView?.updatedAt.getTime(),
      `${String(afterView?.updatedAt.toISOString())}`,
    );

    const detail = await getUseCase.handle({ idOrSlug: sutra.slug });
    check(
      'chi tiết trả isRecitable=true cho SUTRA đã xuất bản',
      detail.isRecitable,
    );
    check(
      'chi tiết trả isRecitable=false cho INFO',
      !(await getUseCase.handle({ idOrSlug: info.slug })).isRecitable,
    );
    await expectThrow(
      'đọc bản nháp bằng SLUG -> NotFound',
      () => getUseCase.handle({ idOrSlug: draft.slug }),
      'DharmaContentNotFoundException',
    );
    await expectThrow(
      'đọc bản nháp bằng ID -> NotFound (không có lối tắt)',
      () => getUseCase.handle({ idOrSlug: draft.globalId }),
      'DharmaContentNotFoundException',
    );

    console.log('\n6. Xuất bản qua đường SỬA vẫn đòi nội dung');

    await expectThrow(
      'bật isPublished cho bản nháp RỖNG -> bị từ chối (soi bản đã lưu)',
      () =>
        updateUseCase.handle({
          actorUserId: AdminId,
          contentId: draft.globalId,
          isPublished: true,
        }),
      'ValidationFailedException',
    );
    const published = await updateUseCase.handle({
      actorUserId: AdminId,
      contentId: draft.globalId,
      bodyText: 'Như thị ngã văn.',
      isPublished: true,
    });
    check(
      'gửi kèm nội dung thì xuất bản được, và có publishedAt',
      published.isPublished && published.publishedAt !== null,
    );
    const unpublished = await updateUseCase.handle({
      actorUserId: AdminId,
      contentId: draft.globalId,
      isPublished: false,
    });
    check(
      'rút khỏi xuất bản thì publishedAt về null (CHK canh cặp đôi)',
      !unpublished.isPublished && unpublished.publishedAt === null,
    );

    console.log('\n7. Ràng buộc database — lớp cuối chặn SQL tay');

    await expectReject(
      'loại nội dung ngoài allowlist bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO dharma_contents (content_type, title, slug, body_text)
           VALUES ('MANTRA', 'Thử', 'thu-loai', 'x')`,
        ),
      'CHK_dharma_contents_type',
    );
    await expectReject(
      'danh mục sai dạng slug bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO dharma_contents (content_type, title, slug, category, body_text)
           VALUES ('SUTRA', 'Thử', 'thu-danh-muc', 'Kinh Đại Thừa', 'x')`,
        ),
      'CHK_dharma_contents_category_shape',
    );
    await expectReject(
      'xuất bản mà thiếu published_at bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO dharma_contents (content_type, title, slug, body_text, is_published)
           VALUES ('SUTRA', 'Thử', 'thu-published-at', 'x', true)`,
        ),
      'CHK_dharma_contents_published_at',
    );
    await expectReject(
      'xuất bản mà nội dung rỗng bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO dharma_contents
             (content_type, title, slug, body_text, is_published, published_at)
           VALUES ('SUTRA', 'Thử', 'thu-body', '   ', true, now())`,
        ),
      'CHK_dharma_contents_published_has_body',
    );
    await expectReject(
      'audio qua http bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO dharma_contents (content_type, title, slug, body_text, audio_url)
           VALUES ('SUTRA', 'Thử', 'thu-audio', 'x', 'http://cdn.chantam.vn/a.mp3')`,
        ),
      'CHK_dharma_contents_audio_url',
    );
    await expectReject(
      'lượt tụng xong mà mốc xong TRƯỚC mốc bắt đầu bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO dharma_recitations
             (content_id, user_id, started_at, completed_at, duration_seconds)
           VALUES ($1, $2, now(), now() - interval '1 hour', 10)`,
          [sutra.globalId, ReciterId],
        ),
      'CHK_dharma_recitations_completed_at',
    );
    await expectReject(
      'chưa xong mà đã có duration bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO dharma_recitations (content_id, user_id, duration_seconds)
           VALUES ($1, $2, 99)`,
          [sutra.globalId, ReciterId],
        ),
      'CHK_dharma_recitations_completed_at',
    );

    console.log('\n8. Xoá mềm và Dharma Hub');

    await deleteUseCase.handle({
      actorUserId: AdminId,
      contentId: temple.globalId,
    });
    const [deletedRow] = await dataSource.query<
      { deleted_at: Date | null; is_published: boolean }[]
    >(
      `SELECT deleted_at, is_published FROM dharma_contents WHERE global_id = $1`,
      [temple.globalId],
    );
    check(
      'xoá là xoá MỀM, và rút khỏi xuất bản luôn',
      deletedRow?.deleted_at !== null && deletedRow?.is_published === false,
      JSON.stringify(deletedRow),
    );
    check(
      'slug đã xoá VẪN giữ chỗ — cột UNIQUE không biết deleted_at',
      await repository.slugTaken(temple.slug),
    );
    check(
      'lịch sử tụng KHÔNG mất khi xoá mềm một bộ kinh khác',
      (
        await listOwnUseCase.handle({
          actorUserId: ReciterId,
          limit: 10,
          offset: 0,
        })
      ).total === 2,
    );
    await expectThrow(
      'xoá lần hai -> NotFound',
      () =>
        deleteUseCase.handle({
          actorUserId: AdminId,
          contentId: temple.globalId,
        }),
      'DharmaContentNotFoundException',
    );

    const hub = await hubUseCase.handle({});
    check(
      'Dharma Hub trả đúng bảy entry của UI-DHARMA-01',
      hub.entries.length === 7,
      `${hub.entries.length} entry`,
    );
    const meritEntry = hub.entries.find((entry) => entry.entry === 'MERIT');
    check(
      'entry Cúng/Công đức trỏ sang /merit-units (UC-DHARMA-05 tái dùng §3.3.11)',
      meritEntry?.path === '/merit-units',
      String(meritEntry?.path),
    );
    check(
      'entry MERIT có itemCount null, KHÔNG phải 0 (thuộc phân hệ khác)',
      meritEntry?.itemCount === null,
      String(meritEntry?.itemCount),
    );
    const sutraEntry = hub.entries.find((entry) => entry.entry === 'SUTRA');
    const [liveSutras] = await dataSource.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM dharma_contents
        WHERE content_type = 'SUTRA' AND is_published AND deleted_at IS NULL`,
    );
    check(
      'entry Kinh sách đếm đúng số bản đã xuất bản',
      String(sutraEntry?.itemCount) === liveSutras.total,
      `${String(sutraEntry?.itemCount)} vs ${liveSutras.total}`,
    );

    const adminPage = await listAdminUseCase.handle({
      actorUserId: AdminId,
      limit: 50,
      offset: 0,
      includeDrafts: true,
    });
    check(
      'Admin thấy cả bản nháp, không thấy bản đã xoá mềm',
      adminPage.items.some((item) => item.globalId === draft.globalId) &&
        !adminPage.items.some((item) => item.globalId === temple.globalId),
    );
    await expectThrow(
      'người không có dharma.read gọi danh sách Admin -> Forbidden',
      () =>
        listAdminUseCase.handle({
          actorUserId: OtherId,
          limit: 10,
          offset: 0,
          includeDrafts: true,
        }),
      'ForbiddenException',
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'F73 Phật Pháp (engine nội dung + tụng kinh): ba loại nội dung dùng CHUNG một bảng theo BR-DHARMA-01, danh sách KHÔNG mang bodyText (kiểm bằng một bản 300 nghìn ký tự), slug xử lý đúng chữ đ, danh mục chuẩn hoá cả lúc ghi lẫn lúc lọc, duration tính Ở DATABASE nên client không bịa được, publishedAt giữ mốc cũ khi sửa tiếp, viewCount không đụng updatedAt, bảy ràng buộc database chặn đúng, và Dharma Hub trỏ entry Công đức sang /merit-units thay vì dựng bản thứ hai'
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
