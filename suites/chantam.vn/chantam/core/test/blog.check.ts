/**
 * Blog / Tin tức trên Postgres THẬT (F64, UC-BLOG-01).
 *
 * ## Vì sao phải có script này
 *
 * `sanitize-html.sanitizer.spec.ts` đã có 22 ca tấn công, nhưng nó đo **giá trị trả về của
 * một hàm**. Câu hỏi thật sự là khác: *thứ nằm trong cột `content_html` có sạch không.*
 *
 * Giữa hai câu đó là cả đường ghi — use case, repository, tham số SQL. Một lượt quên gọi
 * bộ lọc, hoặc gọi rồi ghi biến gốc thay vì biến đã lọc, sẽ không làm phép kiểm nào ở trên
 * đỏ. Nhóm 1 dưới đây chèn payload qua đúng đường repository rồi `SELECT` cột đó ra và hỏi
 * lại.
 *
 * ## Năm ràng buộc chỉ Postgres trả lời được
 *
 * `CHK_blogs_published_at`, `CHK_blogs_published_has_content`, `CHK_blogs_slug_shape`,
 * `UQ_blogs_slug`, và quy tắc giữ `published_at` cũ khi sửa bài đang công khai. Bốn cái đầu
 * là lớp cuối chặn SQL tay; cái thứ năm là một biểu thức `CASE` trong câu `UPDATE` mà không
 * unit test nào chạy tới.
 */
import { slugifyBlogTitle } from '@chantam.vn/chantam.core-lib/models';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import { CreateBlogUseCase } from '../src/application/implementations/blog/blog.use-cases';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { BlogRepository } from '../src/infrastructure/repository/blog.repository';
import { SanitizeHtmlSanitizer } from '../src/infrastructure/security/sanitize-html.sanitizer';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_blog_check';
const AuthorId = 'f1000000-0000-4000-8000-00000000f001';

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
    const repository = new BlogRepository(dataSource.manager);
    const sanitizer = new SanitizeHtmlSanitizer();

    await dataSource.query(
      `INSERT INTO users (global_id, username, password_hash, rank, status)
       VALUES ($1, 'bientap', 'x', 'MEMBER', 'ACTIVE')`,
      [AuthorId],
    );

    const write = (overrides: Record<string, unknown> = {}) => ({
      actorUserId: AuthorId,
      title: 'Tâm Từ Và Hạnh Bố Thí',
      slug: 'tam-tu-va-hanh-bo-thi',
      category: 'PHAT_PHAP' as const,
      summary: 'Ba bậc bố thí',
      contentHtml: sanitizer.sanitizeArticle('<p>Bố thí có <b>ba bậc</b>.</p>'),
      thumbnailUrl: 'https://cdn.chantam.vn/a.webp',
      isPublished: false,
      ...overrides,
    });

    console.log('1. Nội dung ĐÃ LƯU trong cột có sạch không');
    const payload =
      '<p>Mở đầu</p>' +
      '<script>alert(1)</script>' +
      '<img src="x" onerror="alert(2)">' +
      '<a href="javascript:alert(3)">bấm</a>' +
      '<div style="position:fixed">phủ</div>' +
      '<iframe src="https://evil.vn"></iframe>';

    // Đi qua USE CASE thật với payload THÔ, không tự lọc trước rồi mới đưa vào repository.
    //
    // Bản đầu của phép kiểm này gọi `repository.createBlog(sanitizer.sanitizeArticle(...))`
    // — tức nó tự làm sạch rồi hỏi repository có lưu đúng thứ vừa đưa không. Luôn xanh,
    // kể cả khi use case quên gọi bộ lọc. Đo đúng cái không cần đo.
    //
    // `alwaysAllow` chỉ thay lớp quyền; bộ lọc và repository đều là bản thật.
    const alwaysAllow = {
      hasPermission: async () => true,
    } as never;
    const createUseCase = new CreateBlogUseCase(
      repository as never,
      sanitizer as never,
      alwaysAllow,
    );
    const dirty = await createUseCase.handle({
      actorUserId: AuthorId,
      title: 'Bài có payload',
      slug: 'bai-co-payload',
      category: 'PHAT_PHAP',
      summary: null,
      contentHtml: payload,
      thumbnailUrl: 'https://cdn.chantam.vn/a.webp',
      isPublished: true,
    });

    const [storedRow] = await dataSource.query<{ content_html: string }[]>(
      `SELECT content_html FROM blogs WHERE global_id = $1`,
      [dirty.id],
    );
    const stored = (storedRow?.content_html ?? '').toLowerCase();

    check(
      'cột không còn <script',
      !stored.includes('<script'),
      stored.slice(0, 80),
    );
    check('cột không còn <iframe', !stored.includes('<iframe'));
    check('cột không còn handler on*=', !/\son[a-z]+\s*=/.test(stored));
    check('cột không còn javascript:', !stored.includes('javascript:'));
    check('cột không còn style=', !stored.includes('style='));
    check(
      'chữ hợp lệ vẫn được giữ',
      stored.includes('mở đầu') && stored.includes('phủ'),
      stored.slice(0, 100),
    );

    console.log('\n2. CHK_blogs_published_at buộc hai cột khớp nhau');
    await expectReject(
      'is_published = true mà published_at NULL bị từ chối',
      () =>
        dataSource.query(
          `INSERT INTO blogs (title, slug, category, content_html, thumbnail_url, is_published)
           VALUES ('Sai', 'sai-mot', 'PHAT_PHAP', '<p>x</p>', 'https://a.vn/x.webp', true)`,
        ),
      'CHK_blogs_published_at',
    );
    await expectReject(
      'bản nháp mà có published_at cũng bị từ chối',
      () =>
        dataSource.query(
          `INSERT INTO blogs (title, slug, category, is_published, published_at)
           VALUES ('Sai', 'sai-hai', 'PHAT_PHAP', false, now())`,
        ),
      'CHK_blogs_published_at',
    );

    console.log('\n3. Ba ràng buộc còn lại');
    await expectReject(
      'xuất bản mà content_html rỗng bị từ chối ở tầng database',
      () =>
        dataSource.query(
          `INSERT INTO blogs (title, slug, category, content_html, thumbnail_url, is_published, published_at)
           VALUES ('Trắng', 'bai-trang', 'PHAT_PHAP', '', 'https://a.vn/x.webp', true, now())`,
        ),
      'CHK_blogs_published_has_content',
    );
    await expectReject(
      'slug sai dạng bị từ chối',
      () =>
        dataSource.query(
          `INSERT INTO blogs (title, slug, category)
           VALUES ('Sai slug', 'Slug Có Hoa', 'PHAT_PHAP')`,
        ),
      'CHK_blogs_slug_shape',
    );
    await expectReject(
      'chuyên mục lạ bị từ chối',
      () =>
        dataSource.query(
          `INSERT INTO blogs (title, slug, category)
           VALUES ('Sai mục', 'sai-muc', 'TIN_THE_THAO')`,
        ),
      'CHK_blogs_category',
    );

    console.log('\n4. slug: khoá UNIQUE và slugTaken tính cả bài đã xoá mềm');
    const first = await repository.createBlog(write({ slug: 'bai-dau-tien' }));
    check(
      'slugTaken thấy slug vừa dùng',
      (await repository.slugTaken('bai-dau-tien')) === true,
    );
    check(
      'slugTaken BỎ QUA chính bài đang sửa',
      (await repository.slugTaken('bai-dau-tien', first.globalId)) === false,
    );
    await expectReject(
      'trùng slug bị khoá UNIQUE chặn',
      () => repository.createBlog(write({ slug: 'bai-dau-tien' })),
      'UQ_blogs_slug',
    );

    await repository.softDeleteBlog(first.globalId, AuthorId);
    // Cột `UNIQUE` không có điều kiện `deleted_at IS NULL`, nên bỏ qua dòng đã xoá ở
    // `slugTaken` sẽ báo "slug còn trống" rồi INSERT đụng khoá — một 500 thay cho một
    // thông báo đọc được.
    check(
      'sau khi xoá mềm, slug VẪN bị coi là đã dùng',
      (await repository.slugTaken('bai-dau-tien')) === true,
    );
    check(
      'bài đã xoá mềm không còn ở đường công khai',
      (await repository.findPublishedBySlug('bai-dau-tien')) === null,
    );
    check(
      'bài đã xoá mềm không còn tra được bằng id',
      (await repository.findByGlobalId(first.globalId)) === null,
    );

    console.log(
      '\n5. published_at: đặt khi xuất bản, GIỮ khi sửa, xoá khi rút',
    );
    const draft = await repository.createBlog(write({ slug: 'vong-doi' }));
    check('bản nháp có published_at NULL', draft.publishedAt === null);

    const published = await repository.updateBlog({
      ...write({ slug: 'vong-doi', isPublished: true }),
      globalId: draft.globalId,
    });
    check('xuất bản lần đầu đặt published_at', published.publishedAt !== null);

    const firstStamp = published.publishedAt?.getTime() ?? 0;
    const edited = await repository.updateBlog({
      ...write({ slug: 'vong-doi', isPublished: true, title: 'Sửa một typo' }),
      globalId: draft.globalId,
    });
    // Sửa một typo không được đẩy bài lên đầu danh sách như bài mới.
    check(
      'sửa bài ĐANG công khai GIỮ NGUYÊN published_at cũ',
      edited.publishedAt?.getTime() === firstStamp,
      `${String(edited.publishedAt?.toISOString())} vs ${new Date(firstStamp).toISOString()}`,
    );
    check('tiêu đề đã đổi', edited.title === 'Sửa một typo');

    const withdrawn = await repository.updateBlog({
      ...write({ slug: 'vong-doi', isPublished: false }),
      globalId: draft.globalId,
    });
    check('rút xuống thì published_at về NULL', withdrawn.publishedAt === null);

    const republished = await repository.updateBlog({
      ...write({ slug: 'vong-doi', isPublished: true }),
      globalId: draft.globalId,
    });
    check(
      'đăng lại sau khi rút thì có mốc MỚI',
      (republished.publishedAt?.getTime() ?? 0) > firstStamp,
    );
    // Quên `updateReturning` thì `rows[0]` là một MẢNG và `toRecord` trả object toàn
    // `undefined` mà không ném.
    check(
      'UPDATE … RETURNING trả hàng thật, không trả mảng lồng',
      typeof republished.globalId === 'string' && republished.title.length > 0,
    );

    console.log('\n6. Lượt xem không đụng updated_at');
    const beforeView = await repository.findByGlobalId(draft.globalId);
    await repository.incrementViewCount(draft.globalId);
    const afterView = await repository.findByGlobalId(draft.globalId);

    check(
      'viewCount tăng đúng 1',
      (afterView?.viewCount ?? 0) === (beforeView?.viewCount ?? 0) + 1,
      `${beforeView?.viewCount} -> ${afterView?.viewCount}`,
    );
    // Đụng `updated_at` thì mọi bài đọc nhiều sẽ luôn hiện "vừa cập nhật", và Admin mất
    // cách biết bài nào thật sự được sửa.
    check(
      'updated_at KHÔNG nhích',
      afterView?.updatedAt.getTime() === beforeView?.updatedAt.getTime(),
    );

    const hidden = await repository.createBlog(write({ slug: 'con-nhap' }));
    await repository.incrementViewCount(hidden.globalId);
    check(
      'bản nháp không đếm được lượt xem',
      (await repository.findByGlobalId(hidden.globalId))?.viewCount === 0,
    );

    console.log(
      '\n7. Danh sách: không trả nội dung, và nháp không dồn xuống cuối',
    );
    const page = await repository.listBlogs({
      limit: 50,
      offset: 0,
      publishedOnly: false,
    });
    check(
      'bản rút gọn KHÔNG mang contentHtml',
      page.items.every((item) => !('contentHtml' in item)),
    );
    check(
      'tổng đếm toàn bảng, không đếm số dòng trang hiện tại',
      page.total === page.items.length,
      `total=${page.total} items=${page.items.length}`,
    );
    // Thiếu `COALESCE(published_at, created_at)` thì mọi bản nháp dồn xuống cuối với
    // `NULL`, và Admin vừa lưu nháp xong không thấy nó ở đâu.
    check(
      'danh sách CMS có cả bản nháp lẫn bài đã xuất bản',
      page.items.some((i) => i.isPublished) &&
        page.items.some((i) => !i.isPublished),
      JSON.stringify(page.items.map((i) => i.isPublished)),
    );

    const publicPage = await repository.listBlogs({
      limit: 50,
      offset: 0,
      publishedOnly: true,
    });
    check(
      'đường công khai chỉ có bài đã xuất bản',
      publicPage.items.every((i) => i.isPublished),
      JSON.stringify(publicPage.items.map((i) => i.slug)),
    );

    const byCategory = await repository.listBlogs({
      limit: 50,
      offset: 0,
      category: 'SONG_XANH',
      publishedOnly: false,
    });
    check(
      'lọc theo chuyên mục không có bài nào ở SONG_XANH',
      byCategory.total === 0,
    );

    console.log(
      '\n8. Slug sinh từ tiêu đề tiếng Việt qua được CHK_blogs_slug_shape',
    );
    // `slugifyBlogTitle` và ràng buộc regex của cột là hai luật viết ở hai nơi. Nếu lệch
    // nhau thì một tiêu đề hợp lệ sẽ bị database từ chối, và chỉ chỗ này thấy được.
    for (const title of [
      'Đồ Dùng Cho Bé 2026',
      'Vu Lan — Báo Hiếu!!!',
      'ĐẠI ĐỨC và Hạnh Nguyện',
    ]) {
      const slug = slugifyBlogTitle(title);
      let error = '';
      try {
        await repository.createBlog(write({ title, slug }));
      } catch (caught) {
        error = (caught as Error).message.slice(0, 90);
      }
      check(`"${title}" -> "${slug}" lưu được`, error === '', error);
    }
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'F64: nội dung ĐÃ LƯU trong cột sạch payload XSS, năm ràng buộc database chặn đúng, slug đã xoá mềm vẫn giữ chỗ, published_at giữ nguyên khi sửa bài đang công khai, lượt xem không đụng updated_at, và slug sinh từ tiêu đề tiếng Việt khớp regex của cột'
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
