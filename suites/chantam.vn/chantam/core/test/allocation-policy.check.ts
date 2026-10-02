/**
 * Chính sách phân bổ & ghép nối trên Postgres THẬT (SRS §6.2.14, F61).
 *
 * ## Vì sao phải có script này, không chỉ unit test
 *
 * Unit test của `GetSmartMatchesUseCase` mock cả `findSmartMatches`, nên nó chứng minh
 * được "chính sách đi xuống repository đúng giá trị" mà KHÔNG chứng minh được câu SQL
 * dựng ra có chạy nổi hay không. Và ở đúng nhánh mới có một bẫy thật:
 *
 * `:tsQuery` tới trước bản này chỉ xuất hiện trong câu `andWhere` của nhánh OR, nên nó
 * luôn được bind cùng chỗ nó được dùng. Với `categoryMatchRequired = true` nhánh đó
 * không chạy nữa, mà `addSelect('… to_tsquery(:tsQuery)')` vẫn tham chiếu nó — thiếu
 * bind là TypeORM ném, và chỉ ném SAU KHI Admin publish bản bắt buộc danh mục. Tức một
 * lỗi ngủ trong mã nguồn, chờ một lượt đổi cấu hình mới nổ, và mọi phép kiểm mock đều
 * xanh.
 *
 * Phép kiểm số 3 dưới đây là chỗ hỏi câu đó.
 *
 * ## Và phép đo A/B
 *
 * `categoryMatchRequired` chỉ đáng tin nếu CÙNG một bộ dữ liệu cho ra HAI kết quả khác
 * nhau tuỳ cờ. Nên nhóm 4 chạy đúng hai lượt trên cùng bảng và so số dòng — cách duy
 * nhất phân biệt "cờ có tác dụng" với "cờ được truyền xuống rồi bị bỏ qua".
 */
import {
  AllocationPolicyConfigKey,
  DefaultAllocationPolicy,
  allocationPolicyGaps,
  normalizeAllocationPolicy,
} from '@chantam.vn/chantam.core-lib/models';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { PostRepository } from '../src/infrastructure/repository/post.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_allocation_check';

const AdminId = 'd1000000-0000-4000-8000-00000000d001';
const GiverId = 'd1000000-0000-4000-8000-00000000d002';
const SeekerId = 'd1000000-0000-4000-8000-00000000d003';

const CategoryWanted = 'c1000000-0000-4000-8000-00000000c001';
const CategoryOther = 'c1000000-0000-4000-8000-00000000c002';

const SourcePostId = 'f1000000-0000-4000-8000-00000000f001';
const SameCategoryId = 'a1000000-0000-4000-8000-00000000a001';
const KeywordOnlyId = 'a1000000-0000-4000-8000-00000000a002';
const NeitherId = 'a1000000-0000-4000-8000-00000000a003';

const SaiGon = { lat: 10.7724, lng: 106.698 };

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
    extra: { max: 10 },
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    const adminConfig = new AdminConfigRepository(dataSource.manager);
    const posts = new PostRepository(
      entities.PostEntity as never,
      dataSource.manager,
    );

    const addUser = async (id: string, username: string) => {
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, username],
      );
    };
    await addUser(AdminId, 'quantri');
    await addUser(GiverId, 'nguoitang');
    await addUser(SeekerId, 'nguoinhan');

    const addCategory = async (id: string, name: string, slug: string) => {
      await dataSource.query(
        `INSERT INTO categories (global_id, name, slug, is_active)
         VALUES ($1, $2, $3, true)`,
        [id, name, slug],
      );
    };
    await addCategory(CategoryWanted, 'Xe đạp', 'alloc-check-xe-dap');
    await addCategory(CategoryOther, 'Sách', 'alloc-check-sach');

    const addPost = async (
      id: string,
      authorId: string,
      postType: string,
      categoryId: string,
      title: string,
      description: string,
    ) => {
      await dataSource.query(
        `INSERT INTO posts
           (global_id, author_id, post_type, category_id, title, description,
            status, location, area_label, total_quantity, remaining_quantity,
            details)
         VALUES ($1, $2, $3, $4, $5, $6, 'PUBLISHED',
                 ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography,
                 'Quận 1', 1, 1, '{}'::jsonb)`,
        [
          id,
          authorId,
          postType,
          categoryId,
          title,
          description,
          SaiGon.lng,
          SaiGon.lat,
        ],
      );
    };

    // Bài nguồn: người nhận muốn một chiếc xe đạp.
    await addPost(
      SourcePostId,
      SeekerId,
      'WANTED',
      CategoryWanted,
      'Cần xe đạp cho bé',
      'Bé vào lớp một',
    );
    // Ứng viên 1: cùng danh mục, cũng trùng từ khoá.
    await addPost(
      SameCategoryId,
      GiverId,
      'OFFER',
      CategoryWanted,
      'Tặng xe đạp cũ',
      'Xe còn tốt',
    );
    // Ứng viên 2: KHÁC danh mục nhưng trùng từ khoá "xe" và "đạp".
    await addPost(
      KeywordOnlyId,
      GiverId,
      'OFFER',
      CategoryOther,
      'Tặng sách kèm xe đạp mini',
      'Dọn nhà',
    );
    // Ứng viên 3: khác danh mục, không trùng từ khoá nào.
    await addPost(
      NeitherId,
      GiverId,
      'OFFER',
      CategoryOther,
      'Tặng bộ nồi inox',
      'Chuyển nhà',
    );

    console.log('1. Khoá vắng mặt nghĩa là chạy y như trước');
    const beforePublish = await adminConfig.getConfigValue(
      AllocationPolicyConfigKey,
    );
    check(
      '`allocation.policy` chưa có dòng nào — vắng mặt là có chủ ý',
      beforePublish === null || beforePublish === undefined,
      String(beforePublish),
    );
    check(
      'thiếu dòng thì `normalizeAllocationPolicy` trả đúng mặc định',
      JSON.stringify(normalizeAllocationPolicy(beforePublish)) ===
        JSON.stringify(DefaultAllocationPolicy),
    );

    console.log('\n2. Publish ghi JSON thật và đi theo copy-on-write');
    // Gõ `5/3/2` như Admin sẽ gõ, không gõ số đã chia: phép kiểm phải chứng minh
    // CHÍNH SÁCH ĐÃ CHUẨN HOÁ là thứ nằm trong bảng, không phải số thô.
    const typed = normalizeAllocationPolicy({
      categoryMatchRequired: true,
      distanceRule: 'RANK_OR_FILTER',
      keywordMatchEnabled: true,
      autoCreateTransaction: false,
      maxSuggestions: 7,
      weights: { sameCategory: 5, keyword: 3, proximity: 2 },
    });
    check(
      'chính sách Admin gõ không còn gap nào',
      allocationPolicyGaps(typed).length === 0,
      allocationPolicyGaps(typed).join('; '),
    );

    await adminConfig.publishSystemConfig({
      actorUserId: AdminId,
      key: AllocationPolicyConfigKey,
      value: typed,
      valueType: 'JSON',
      reason: 'Bật bắt buộc cùng danh mục cho gợi ý',
    });

    const [storedRow] = await dataSource.query<
      { value_json: unknown; value_type: string; version: string }[]
    >(
      `SELECT value_json, value_type, version FROM system_configs
       WHERE config_key = $1 AND effective_to IS NULL`,
      [AllocationPolicyConfigKey],
    );
    check('lưu đúng một dòng đang hiệu lực', storedRow !== undefined);
    check(
      'value_type là JSON, không phải INTEGER',
      storedRow?.value_type === 'JSON',
      storedRow?.value_type,
    );
    // `value_json` là jsonb nên node-pg trả về OBJECT, không trả về chuỗi. Nếu nó ra
    // chuỗi thì nghĩa là đã `JSON.stringify` hai lần, và mọi lượt đọc sau sẽ nhận một
    // chuỗi mà `normalizeAllocationPolicy` coi là "không phải object" rồi âm thầm lùi
    // về mặc định — cấu hình lưu được mà không bao giờ có tác dụng.
    check(
      'value_json là object, không phải chuỗi JSON lồng hai lần',
      typeof storedRow?.value_json === 'object' &&
        storedRow.value_json !== null,
      typeof storedRow?.value_json,
    );

    const readBack = normalizeAllocationPolicy(
      await adminConfig.getConfigValue(AllocationPolicyConfigKey),
    );
    check(
      'đọc lại ra đúng chính sách đã ghi (chuẩn hoá là idempotent)',
      JSON.stringify(readBack) === JSON.stringify(typed),
      JSON.stringify(readBack),
    );
    check(
      'trọng số trong bảng là bộ ĐÃ CHIA, không phải 5/3/2',
      Math.abs(readBack.weights.sameCategory - 0.5) < 1e-9 &&
        Math.abs(readBack.weights.keyword - 0.3) < 1e-9,
      JSON.stringify(readBack.weights),
    );

    // Publish lần hai: bản cũ phải bị đóng lại, không phải sửa tại chỗ.
    await adminConfig.publishSystemConfig({
      actorUserId: AdminId,
      key: AllocationPolicyConfigKey,
      value: { ...typed, maxSuggestions: 9 },
      valueType: 'JSON',
      reason: 'Nới số gợi ý lên 9',
    });
    const versions = await dataSource.query<
      { version: string; effective_to: Date | null }[]
    >(
      `SELECT version, effective_to FROM system_configs
       WHERE config_key = $1 ORDER BY version`,
      [AllocationPolicyConfigKey],
    );
    check(
      'hai bản, không ghi đè',
      versions.length === 2,
      String(versions.length),
    );
    check(
      'bản cũ đã đóng và bản mới còn mở',
      versions[0]?.effective_to !== null && versions[1]?.effective_to === null,
    );

    const auditRows = await dataSource.query<
      { count: string; reasons: string | null }[]
    >(
      `SELECT count(*)::text AS count,
              string_agg(reason, ' | ' ORDER BY id) AS reasons
       FROM admin_audit_logs
       WHERE resource_id = $1`,
      [AllocationPolicyConfigKey],
    );
    // Đổi luật ghép nối mà không để dấu là không trả lời được "ai bật bắt buộc danh
    // mục, lúc nào" — cùng lỗi đã bắt ở BR-ADM-POINT-07 với lượt thu hồi điểm.
    check(
      'mỗi lượt publish để lại dấu trong admin_audit_logs',
      Number(auditRows[0]?.count ?? 0) >= 2,
      `${auditRows[0]?.count ?? 0} dòng`,
    );
    check(
      'dấu audit mang theo LÝ DO Admin gõ, không chỉ mang tên khoá',
      (auditRows[0]?.reasons ?? '').includes('Nới số gợi ý lên 9'),
      auditRows[0]?.reasons ?? '(rỗng)',
    );

    console.log(
      '\n3. categoryMatchRequired = true chạy nổi trên SQL thật (bẫy :tsQuery)',
    );
    // Đây là phép kiểm mà mọi unit test mock đều không thấy: nhánh bắt buộc danh mục
    // không đi qua câu `andWhere` từng bind `:tsQuery`, nên nếu `addSelect` không tự
    // bind thì TypeORM ném ngay tại đây.
    let strictError = '';
    let strict: Awaited<ReturnType<typeof posts.findSmartMatches>> = [];
    try {
      strict = await posts.findSmartMatches({
        sourcePostId: SourcePostId,
        excludeAuthorId: SeekerId,
        postType: 'OFFER' as never,
        categoryId: CategoryWanted,
        origin: SaiGon,
        radiusMeters: 20_000,
        keywords: ['xe', 'đạp'],
        categoryMatchRequired: true,
        take: 20,
      });
    } catch (error) {
      strictError = (error as Error).message;
    }
    check(
      'truy vấn không ném khi vừa bắt buộc danh mục vừa có từ khoá',
      strictError === '',
      strictError,
    );
    check(
      '`keyword_matched` vẫn tính được để chấm điểm, dù từ khoá hết là đường vào',
      strict.some((candidate) => candidate.keywordMatched),
      JSON.stringify(strict.map((c) => c.keywordMatched)),
    );

    console.log('\n4. Phép đo A/B: cùng dữ liệu, hai cờ, hai kết quả');
    const loose = await posts.findSmartMatches({
      sourcePostId: SourcePostId,
      excludeAuthorId: SeekerId,
      postType: 'OFFER' as never,
      categoryId: CategoryWanted,
      origin: SaiGon,
      radiusMeters: 20_000,
      keywords: ['xe', 'đạp'],
      categoryMatchRequired: false,
      take: 20,
    });

    const strictIds = strict.map((c) => c.post.globalId).sort();
    const looseIds = loose.map((c) => c.post.globalId).sort();

    check(
      'bắt buộc danh mục trả về ĐÚNG bài cùng danh mục',
      strictIds.length === 1 && strictIds[0] === SameCategoryId,
      JSON.stringify(strictIds),
    );
    check(
      'không bắt buộc thì bài khác danh mục nhưng trùng từ khoá cũng vào',
      looseIds.length === 2 && looseIds.includes(KeywordOnlyId),
      JSON.stringify(looseIds),
    );
    check(
      'cờ có tác dụng thật: hai lượt cho hai tập kết quả khác nhau',
      strictIds.join(',') !== looseIds.join(','),
    );
    check(
      'bài không cùng danh mục và không trùng từ khoá bị loại ở CẢ HAI nhánh',
      !strictIds.includes(NeitherId) && !looseIds.includes(NeitherId),
    );

    console.log('\n5. Tắt từ khoá thì chỉ còn danh mục');
    const noKeyword = await posts.findSmartMatches({
      sourcePostId: SourcePostId,
      excludeAuthorId: SeekerId,
      postType: 'OFFER' as never,
      categoryId: CategoryWanted,
      origin: SaiGon,
      radiusMeters: 20_000,
      // `keywordMatchEnabled: false` ở tầng use case biến thành mảng rỗng ở đây.
      keywords: [],
      categoryMatchRequired: false,
      take: 20,
    });
    check(
      'mảng từ khoá rỗng vẫn chạy và chỉ lọc theo danh mục',
      noKeyword.length === 1 && noKeyword[0]?.post.globalId === SameCategoryId,
      JSON.stringify(noKeyword.map((c) => c.post.globalId)),
    );
    check(
      'không có từ khoá thì keyword_matched là false cho mọi ứng viên',
      noKeyword.every((candidate) => candidate.keywordMatched === false),
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'F61 allocation.policy: khoá vắng mặt nghĩa là chạy y như cũ, publish ghi jsonb thật theo copy-on-write và để dấu audit, nhánh bắt buộc danh mục chạy nổi trên SQL thật, và phép đo A/B chứng minh cờ đổi được tập kết quả'
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
