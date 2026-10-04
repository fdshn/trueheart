/**
 * Công đức / Hồi hướng trên Postgres THẬT (SRS UI-MERIT-01, F65 phân hệ 4).
 *
 * ## Điều quan trọng nhất script này kiểm: TÊN người ẩn danh không ra khỏi database
 *
 * Ẩn danh là thứ người dùng tin hệ thống làm đúng, và nếu sai thì sai một lần là xong — tên
 * đã lộ không rút lại được. Nhóm 4 không chỉ kiểm `donorLabel` bằng "Người ẩn danh"; nó kiểm
 * **toàn bộ chuỗi JSON của response** không chứa tên thật ở bất cứ đâu. Một lượt thêm trường
 * vô ý về sau sẽ làm nhóm đó đỏ.
 *
 * Lọc ở tầng REPOSITORY, không ở tầng trên: câu SQL dùng `CASE WHEN is_anonymous THEN NULL`
 * nên tên không bao giờ nằm trong kết quả truy vấn. Lọc ở use case thì tên vẫn đi qua dây
 * mạng nội bộ và vào log — và một lượt `console.log(rows)` khi gỡ lỗi là lộ.
 *
 * ## Bốn điều khác chỉ Postgres trả lời được
 *
 * 1. **`getDeclaredTotals` chỉ cộng hàng `COMPLETED`.** `INTENDED` là dự định; cộng nó là
 *    nói quá về số tiền một ngôi chùa đã nhận.
 * 2. **`SUM(bigint)` trả `numeric`, và `numeric` qua node-pg về dạng CHUỖI.** Đọc thẳng là
 *    trả `"1500000"` ra API rồi mọi phép cộng ở client thành nối chuỗi.
 * 3. **`CHK_merit_declarations_completed_at`** buộc mốc thời gian khớp trạng thái.
 * 4. **`markDeclarationCompleted` có phép kiểm chủ sở hữu TRONG câu `UPDATE`** — người khác
 *    không đánh dấu hộ được, và hai lượt bấm song song chỉ một lượt thắng.
 */
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import {
  CompleteMeritDeclarationUseCase,
  CreateMeritUnitUseCase,
  DeclareMeritUseCase,
  DeleteMeritUnitUseCase,
  GetMeritUnitUseCase,
  ListAdminMeritUnitsUseCase,
  ListOwnMeritDeclarationsUseCase,
  SetMeritUnitActiveUseCase,
  UpdateMeritUnitUseCase,
} from '../src/application/implementations/merit/merit.use-cases';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { MeritRepository } from '../src/infrastructure/repository/merit.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_merit_check';

const AdminId = 'e1000000-0000-4000-8000-0000000000ad';
const DonorId = 'e1000000-0000-4000-8000-0000000000d1';
const AnonDonorId = 'e1000000-0000-4000-8000-0000000000d2';
const OutsiderId = 'e1000000-0000-4000-8000-0000000000ff';

/** Tên THẬT của người chọn ẩn danh. Không chuỗi nào trong response được chứa nó. */
const AnonRealName = 'Nguyễn Thị Bí Mật';

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

function unitInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Chùa Vĩnh Nghiêm',
    unitType: 'TEMPLE',
    purpose: 'Trợ duyên xây dựng nhà ăn từ thiện cho bệnh nhân nghèo.',
    bankBin: '970415',
    bankAccountNumber: '113366668888',
    bankAccountName: 'CHUA VINH NGHIEM',
    bankName: 'VietinBank',
    lat: 10.7897,
    lng: 106.6836,
    addressLabel: '339 Nam Kỳ Khởi Nghĩa, Quận 3',
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
    const repository = new MeritRepository(dataSource.manager);
    const adminConfig = new AdminConfigRepository(dataSource.manager);

    const createUseCase = new CreateMeritUnitUseCase(repository, adminConfig);
    const updateUseCase = new UpdateMeritUnitUseCase(repository, adminConfig);
    const listAdminUseCase = new ListAdminMeritUnitsUseCase(
      repository,
      adminConfig,
    );
    const setActiveUseCase = new SetMeritUnitActiveUseCase(
      repository,
      adminConfig,
    );
    const deleteUseCase = new DeleteMeritUnitUseCase(repository, adminConfig);
    const getUseCase = new GetMeritUnitUseCase(repository);
    const declareUseCase = new DeclareMeritUseCase(repository);
    const completeUseCase = new CompleteMeritDeclarationUseCase(repository);
    const listOwnUseCase = new ListOwnMeritDeclarationsUseCase(repository);

    for (const [id, username, fullName] of [
      [AdminId, 'quantri', 'Quản Trị Viên'],
      [DonorId, 'phattam', 'Trần Văn Phát Tâm'],
      [AnonDonorId, 'anchim', AnonRealName],
      [OutsiderId, 'nguoingoaicuoc', 'Người Ngoài Cuộc'],
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

    console.log('1. Quyền merit.* — merit.manage CHỈ cho SUPER_ADMIN');

    check(
      'SUPER_ADMIN có merit.manage',
      await adminConfig.hasPermission(AdminId, 'merit.manage'),
    );
    check(
      'CAMPAIGN_MANAGER có merit.read nhưng KHÔNG có merit.manage',
      (
        await dataSource.query<{ codes: string }[]>(
          `SELECT coalesce(string_agg(permission.code, ',' ORDER BY permission.code), '') AS codes
             FROM admin_role_permissions link
             JOIN admin_roles role ON role.id = link.role_id
             JOIN admin_permissions permission ON permission.id = link.permission_id
            WHERE role.code = 'CAMPAIGN_MANAGER' AND permission.code LIKE 'merit.%'`,
        )
      )[0].codes === 'merit.read',
    );
    check(
      'CHỈ SUPER_ADMIN giữ merit.manage — đây là quyền sửa số tài khoản ngân hàng',
      (
        await dataSource.query<{ codes: string }[]>(
          `SELECT coalesce(string_agg(role.code, ',' ORDER BY role.code), '') AS codes
             FROM admin_role_permissions link
             JOIN admin_roles role ON role.id = link.role_id
             JOIN admin_permissions permission ON permission.id = link.permission_id
            WHERE permission.code = 'merit.manage'`,
        )
      )[0].codes === 'SUPER_ADMIN',
    );
    await expectThrow(
      'người không có quyền tạo đơn vị -> ForbiddenException',
      () => createUseCase.handle({ ...unitInput(), actorUserId: OutsiderId }),
      'ForbiddenException',
    );

    console.log('\n2. Tạo đơn vị và mã VietQR');

    const unit = await createUseCase.handle({
      ...unitInput(),
      actorUserId: AdminId,
    });
    check(
      'slug sinh từ tên tiếng Việt, bỏ dấu đúng',
      unit.slug === 'chua-vinh-nghiem',
      unit.slug,
    );
    check(
      'mã VietQR dựng từ BIN và số tài khoản',
      unit.vietQrUrl.startsWith(
        'https://img.vietqr.io/image/970415-113366668888-compact2.png',
      ),
      unit.vietQrUrl,
    );
    check(
      'mã VietQR ở trang danh sách KHÔNG gắn số tiền',
      !unit.vietQrUrl.includes('amount='),
      unit.vietQrUrl,
    );
    check(
      'toạ độ đọc ra đúng chiều (ST_Y là vĩ độ)',
      Math.abs((unit.lat ?? 0) - 10.7897) < 0.0001 &&
        Math.abs((unit.lng ?? 0) - 106.6836) < 0.0001,
      `lat=${String(unit.lat)} lng=${String(unit.lng)}`,
    );
    check(
      'đơn vị mới: tổng lời khai là 0 và không có lượt nào hoàn tất',
      unit.totalDeclaredAmount === 0 && unit.completedCount === 0,
    );
    await expectThrow(
      'BIN sai định dạng bị từ chối ở use case',
      () =>
        createUseCase.handle({
          ...unitInput({ name: 'Chùa Khác', bankBin: '97041' }),
          actorUserId: AdminId,
        }),
      'ValidationFailedException',
    );
    await expectThrow(
      'slug trùng bị từ chối với thông báo đọc được',
      () =>
        createUseCase.handle({
          ...unitInput({ slug: 'chua-vinh-nghiem', name: 'Tên khác' }),
          actorUserId: AdminId,
        }),
      'ValidationFailedException',
    );

    console.log('\n3. Khai công đức — số tiền CÓ lưu, và là LỜI KHAI');

    const intended = await declareUseCase.handle({
      actorUserId: DonorId,
      unitId: unit.globalId,
      declaredAmount: 500_000,
      status: 'INTENDED',
      note: 'Cầu an cho gia đình',
    });
    check(
      'lời khai được LƯU, đúng số tiền',
      intended.declaration.declaredAmount === 500_000 &&
        intended.declaration.status === 'INTENDED',
      `${intended.declaration.declaredAmount}/${intended.declaration.status}`,
    );
    check(
      'declaredAmount là SỐ, không phải chuỗi (bigint về dạng chuỗi)',
      typeof intended.declaration.declaredAmount === 'number',
      typeof intended.declaration.declaredAmount,
    );
    check(
      'INTENDED thì chưa có completedAt',
      intended.declaration.completedAt === null,
    );
    check(
      'mã VietQR của lượt khai CÓ gắn đúng số tiền',
      intended.vietQrUrl.includes('amount=500000'),
      intended.vietQrUrl,
    );

    const beforeComplete = await repository.getDeclaredTotals(unit.globalId);
    check(
      'INTENDED KHÔNG được cộng vào tổng — dự định không phải đã chuyển',
      beforeComplete.totalDeclaredAmount === 0 &&
        beforeComplete.completedCount === 0,
      JSON.stringify(beforeComplete),
    );

    const completed = await completeUseCase.handle({
      actorUserId: DonorId,
      declarationId: intended.declaration.globalId,
    });
    check(
      'đánh dấu hoàn tất -> COMPLETED kèm mốc thời gian',
      completed.status === 'COMPLETED' && completed.completedAt !== null,
    );
    await expectThrow(
      'đánh dấu lần hai -> AlreadyCompleted',
      () =>
        completeUseCase.handle({
          actorUserId: DonorId,
          declarationId: intended.declaration.globalId,
        }),
      'MeritDeclarationAlreadyCompletedException',
    );

    // Lời khai thứ hai, ẩn danh, đã chuyển ngay.
    const anonDeclaration = await declareUseCase.handle({
      actorUserId: AnonDonorId,
      unitId: unit.globalId,
      declaredAmount: 1_000_000,
      status: 'COMPLETED',
      isAnonymous: true,
      note: 'Hồi hướng cho cha mẹ',
    });
    check(
      'khai COMPLETED ngay thì có completedAt luôn',
      anonDeclaration.declaration.completedAt !== null,
    );

    const totals = await repository.getDeclaredTotals(unit.globalId);
    check(
      'tổng CHỈ cộng hàng COMPLETED: 500.000 + 1.000.000',
      totals.totalDeclaredAmount === 1_500_000 && totals.completedCount === 2,
      JSON.stringify(totals),
    );
    check(
      'tổng là SỐ, không phải chuỗi (SUM(bigint) trả numeric)',
      typeof totals.totalDeclaredAmount === 'number',
      typeof totals.totalDeclaredAmount,
    );

    await expectThrow(
      'người khác đánh dấu hộ -> không tìm thấy (không tiết lộ là của ai)',
      () =>
        completeUseCase.handle({
          actorUserId: OutsiderId,
          declarationId: anonDeclaration.declaration.globalId,
        }),
      'MeritUnitNotFoundException',
    );

    console.log('\n4. ẨN DANH — tên thật KHÔNG ra khỏi database');

    const detail = await getUseCase.handle({ idOrSlug: unit.slug });
    const anonEntry = detail.ledger.find(
      (entry) => entry.globalId === anonDeclaration.declaration.globalId,
    );
    const namedEntry = detail.ledger.find(
      (entry) => entry.globalId === intended.declaration.globalId,
    );
    check(
      'hàng ẩn danh hiện "Người ẩn danh"',
      anonEntry?.donorLabel === 'Người ẩn danh',
      anonEntry?.donorLabel,
    );
    check(
      'hàng KHÔNG ẩn danh hiện tên thật',
      namedEntry?.donorLabel === 'Trần Văn Phát Tâm',
      namedEntry?.donorLabel,
    );

    // Phép kiểm QUAN TRỌNG NHẤT của script này: soát toàn bộ chuỗi JSON, không chỉ một
    // trường. Một lượt thêm trường vô ý về sau sẽ làm dòng này đỏ.
    const serialized = JSON.stringify(detail);
    check(
      'TOÀN BỘ response chi tiết KHÔNG chứa tên thật của người ẩn danh',
      !serialized.includes(AnonRealName),
      serialized.includes(AnonRealName) ? 'LỘ TÊN' : 'sạch',
    );

    // Và kiểm ở tầng SQL: câu truy vấn của repository không kéo tên về.
    const ledgerPage = await repository.listLedger({
      unitId: unit.globalId,
      limit: 50,
      offset: 0,
    });
    check(
      'kết quả listLedger của repository cũng không chứa tên thật',
      !JSON.stringify(ledgerPage).includes(AnonRealName),
    );

    // Nhưng chính người đó phải xem lại được lời khai của mình.
    const own = await listOwnUseCase.handle({
      actorUserId: AnonDonorId,
      limit: 10,
      offset: 0,
    });
    check(
      'người ẩn danh vẫn xem lại được lời khai của chính mình',
      own.total === 1 &&
        own.items[0].globalId === anonDeclaration.declaration.globalId &&
        own.items[0].isAnonymous,
      `total=${own.total}`,
    );
    check(
      'hàng ẩn danh vẫn giữ nguyên user_id trong database — ẩn TÊN, không xoá dữ liệu',
      (
        await dataSource.query<{ user_id: string }[]>(
          `SELECT user_id FROM merit_declarations WHERE global_id = $1`,
          [anonDeclaration.declaration.globalId],
        )
      )[0].user_id === AnonDonorId,
    );

    console.log('\n5. Tắt đơn vị thì không nhận lời khai mới');

    await setActiveUseCase.handle({
      actorUserId: AdminId,
      unitId: unit.globalId,
      isActive: false,
    });
    await expectThrow(
      'đơn vị đã tắt -> không khai được',
      () =>
        declareUseCase.handle({
          actorUserId: DonorId,
          unitId: unit.globalId,
          declaredAmount: 100_000,
          status: 'INTENDED',
        }),
      'MeritUnitNotFoundException',
    );
    await expectThrow(
      'đơn vị đã tắt -> không đọc được qua đường công khai',
      () => getUseCase.handle({ idOrSlug: unit.slug }),
      'MeritUnitNotFoundException',
    );
    check(
      'Admin vẫn thấy đơn vị đã tắt khi includeInactive=true',
      (
        await listAdminUseCase.handle({
          actorUserId: AdminId,
          limit: 50,
          offset: 0,
          includeInactive: true,
        })
      ).items.some((item) => item.globalId === unit.globalId),
    );
    check(
      'Admin KHÔNG thấy nó khi includeInactive=false',
      !(
        await listAdminUseCase.handle({
          actorUserId: AdminId,
          limit: 50,
          offset: 0,
          includeInactive: false,
        })
      ).items.some((item) => item.globalId === unit.globalId),
    );

    await setActiveUseCase.handle({
      actorUserId: AdminId,
      unitId: unit.globalId,
      isActive: true,
    });

    console.log('\n6. Sửa đơn vị — gồm số tài khoản ngân hàng');

    const patched = await updateUseCase.handle({
      actorUserId: AdminId,
      unitId: unit.globalId,
      bankAccountNumber: '999988887777',
    });
    check(
      'sửa số tài khoản thì mã VietQR đổi theo',
      patched.bankAccountNumber === '999988887777' &&
        patched.vietQrUrl.includes('970415-999988887777'),
      patched.vietQrUrl,
    );
    check(
      'sửa một trường không đụng các trường khác',
      patched.name === 'Chùa Vĩnh Nghiêm' && patched.bankBin === '970415',
    );
    check(
      'sửa đơn vị KHÔNG làm mất Sổ vàng đã có',
      (await repository.getDeclaredTotals(unit.globalId))
        .totalDeclaredAmount === 1_500_000,
    );
    await expectThrow(
      'sửa với BIN sai định dạng bị từ chối',
      () =>
        updateUseCase.handle({
          actorUserId: AdminId,
          unitId: unit.globalId,
          bankBin: 'abcdef',
        }),
      'ValidationFailedException',
    );

    console.log('\n7. Ràng buộc database — lớp cuối chặn SQL tay');

    await expectReject(
      'BIN không phải sáu chữ số bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO merit_units
             (name, slug, unit_type, purpose, bank_bin, bank_account_number, bank_account_name)
           VALUES ('Thử', 'thu-bin', 'TEMPLE', 'Mô tả mục đích đủ dài.',
                   '12345', '113366668888', 'THU')`,
        ),
      'CHK_merit_units_bank_bin',
    );
    await expectReject(
      'loại đơn vị ngoài allowlist bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO merit_units
             (name, slug, unit_type, purpose, bank_bin, bank_account_number, bank_account_name)
           VALUES ('Thử', 'thu-loai', 'NHA_THO', 'Mô tả mục đích đủ dài.',
                   '970415', '113366668888', 'THU')`,
        ),
      'CHK_merit_units_type',
    );
    await expectReject(
      'mục đích quá ngắn bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO merit_units
             (name, slug, unit_type, purpose, bank_bin, bank_account_number, bank_account_name)
           VALUES ('Thử', 'thu-purpose', 'TEMPLE', 'ngắn',
                   '970415', '113366668888', 'THU')`,
        ),
      'CHK_merit_units_purpose',
    );
    await expectReject(
      'INTENDED mà mang completed_at bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO merit_declarations
             (unit_id, user_id, declared_amount, status, completed_at)
           VALUES ($1, $2, 100000, 'INTENDED', now())`,
          [unit.globalId, DonorId],
        ),
      'CHK_merit_declarations_completed_at',
    );
    await expectReject(
      'COMPLETED mà thiếu completed_at bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO merit_declarations
             (unit_id, user_id, declared_amount, status)
           VALUES ($1, $2, 100000, 'COMPLETED')`,
          [unit.globalId, DonorId],
        ),
      'CHK_merit_declarations_completed_at',
    );
    await expectReject(
      'số tiền dưới mức tối thiểu bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO merit_declarations (unit_id, user_id, declared_amount, status)
           VALUES ($1, $2, 1, 'INTENDED')`,
          [unit.globalId, DonorId],
        ),
      'CHK_merit_declarations_amount',
    );
    await expectReject(
      'slug trùng bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO merit_units
             (name, slug, unit_type, purpose, bank_bin, bank_account_number, bank_account_name)
           VALUES ('Thử', $1, 'TEMPLE', 'Mô tả mục đích đủ dài.',
                   '970415', '113366668888', 'THU')`,
          [unit.slug],
        ),
      'UQ_merit_units_slug',
    );

    console.log('\n8. Xoá đơn vị là xoá MỀM');

    const second = await createUseCase.handle({
      ...unitInput({ name: 'Quỹ Sẻ Chia', unitType: 'FUND' }),
      actorUserId: AdminId,
    });
    await deleteUseCase.handle({
      actorUserId: AdminId,
      unitId: second.globalId,
    });
    const [deletedRow] = await dataSource.query<
      { deleted_at: Date | null; is_active: boolean }[]
    >(`SELECT deleted_at, is_active FROM merit_units WHERE global_id = $1`, [
      second.globalId,
    ]);
    check(
      'hàng còn trong database, deleted_at đã đặt, is_active về false',
      deletedRow?.deleted_at !== null && deletedRow?.is_active === false,
      JSON.stringify(deletedRow),
    );
    check(
      'slug của đơn vị đã xoá VẪN giữ chỗ — cột UNIQUE không biết deleted_at',
      await repository.slugTaken(second.slug),
    );
    await expectThrow(
      'xoá lần hai -> NotFound',
      () =>
        deleteUseCase.handle({
          actorUserId: AdminId,
          unitId: second.globalId,
        }),
      'MeritUnitNotFoundException',
    );
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'F65 Công đức: tên thật của người ẩn danh KHÔNG xuất hiện ở bất cứ đâu trong response (soát cả chuỗi JSON) nhưng họ vẫn xem lại được lời khai của mình, số tiền tự khai CÓ lưu và chỉ hàng COMPLETED vào tổng, SUM(bigint) trả về dạng số chứ không chuỗi, mã VietQR gắn đúng số tiền ở lượt khai và không gắn ở trang danh sách, merit.manage CHỈ SUPER_ADMIN giữ, bảy ràng buộc database chặn đúng, và xoá là xoá mềm giữ nguyên Sổ vàng'
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
