import {
  MeritDeclarationAlreadyCompletedException,
  MeritUnitNotFoundException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IMeritDeclaration,
  IMeritRepository,
  IMeritUnit,
} from '@/domain/ports/repository';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  CompleteMeritDeclarationUseCase,
  CreateMeritUnitUseCase,
  DeclareMeritUseCase,
  UpdateMeritUnitUseCase,
} from './merit.use-cases';

const AdminId = 'admin';
const DonorId = 'donor';

function unit(overrides: Partial<IMeritUnit> = {}): IMeritUnit {
  return {
    globalId: 'unit-1',
    name: 'Chùa Vĩnh Nghiêm',
    slug: 'chua-vinh-nghiem',
    unitType: 'TEMPLE',
    purpose: 'Trợ duyên xây dựng nhà ăn từ thiện cho bệnh nhân nghèo.',
    description: null,
    coverUrl: null,
    addressLabel: null,
    lat: null,
    lng: null,
    bankBin: '970415',
    bankAccountNumber: '113366668888',
    bankAccountName: 'CHUA VINH NGHIEM',
    bankName: 'VietinBank',
    displayOrder: 1,
    isActive: true,
    createdBy: AdminId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function declaration(
  overrides: Partial<IMeritDeclaration> = {},
): IMeritDeclaration {
  return {
    globalId: 'declaration-1',
    unitId: 'unit-1',
    userId: DonorId,
    declaredAmount: 500_000,
    status: 'INTENDED',
    isAnonymous: false,
    note: null,
    declaredAt: new Date(),
    completedAt: null,
    ...overrides,
  };
}

function makeRepository(): jest.Mocked<IMeritRepository> {
  return {
    createUnit: jest.fn().mockResolvedValue(unit()),
    slugTaken: jest.fn().mockResolvedValue(false),
    findUnitByGlobalId: jest.fn(),
    findPublicUnitByIdOrSlug: jest.fn().mockResolvedValue(unit()),
    listPublicUnits: jest.fn(),
    listUnitsForAdmin: jest.fn(),
    updateUnit: jest.fn().mockResolvedValue(unit()),
    setUnitActive: jest.fn(),
    softDeleteUnit: jest.fn(),
    createDeclaration: jest.fn().mockResolvedValue(declaration()),
    findDeclarationByGlobalId: jest.fn(),
    markDeclarationCompleted: jest.fn(),
    listLedger: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    listOwnDeclarations: jest.fn(),
    getDeclaredTotals: jest
      .fn()
      .mockResolvedValue({ totalDeclaredAmount: 0, completedCount: 0 }),
  } as unknown as jest.Mocked<IMeritRepository>;
}

function makeAdmin(granted: boolean) {
  return {
    hasPermission: jest.fn().mockResolvedValue(granted),
  } as unknown as jest.Mocked<IAdminConfigRepository>;
}

function unitInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Chùa Vĩnh Nghiêm',
    unitType: 'TEMPLE',
    purpose: 'Trợ duyên xây dựng nhà ăn từ thiện cho bệnh nhân nghèo.',
    bankBin: '970415',
    bankAccountNumber: '113366668888',
    bankAccountName: 'CHUA VINH NGHIEM',
    ...overrides,
  };
}

describe('CreateMeritUnitUseCase', () => {
  it('đòi merit.manage — quyền sửa số tài khoản ngân hàng', async () => {
    const repository = makeRepository();
    const admin = makeAdmin(true);

    await new CreateMeritUnitUseCase(repository, admin).handle({
      ...unitInput(),
      actorUserId: AdminId,
    });

    expect(admin.hasPermission).toHaveBeenCalledWith(AdminId, 'merit.manage');
  });

  it('không có quyền thì ForbiddenException và KHÔNG ghi gì', async () => {
    const repository = makeRepository();
    await expect(
      new CreateMeritUnitUseCase(repository, makeAdmin(false)).handle({
        ...unitInput(),
        actorUserId: AdminId,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.createUnit).not.toHaveBeenCalled();
  });

  it('kiểm quyền TRƯỚC khi hỏi slug', async () => {
    const repository = makeRepository();
    await expect(
      new CreateMeritUnitUseCase(repository, makeAdmin(false)).handle({
        ...unitInput({ bankBin: 'x' }),
        actorUserId: AdminId,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.slugTaken).not.toHaveBeenCalled();
  });

  it('slug sinh từ tên, bỏ dấu tiếng Việt', async () => {
    const repository = makeRepository();

    await new CreateMeritUnitUseCase(repository, makeAdmin(true)).handle({
      ...unitInput({ name: 'Chùa Đồng Đắc' }),
      actorUserId: AdminId,
    });

    expect(repository.createUnit).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'chua-dong-dac' }),
    );
  });

  it('BIN sai bị từ chối trước khi ghi', async () => {
    const repository = makeRepository();
    await expect(
      new CreateMeritUnitUseCase(repository, makeAdmin(true)).handle({
        ...unitInput({ bankBin: '12345' }),
        actorUserId: AdminId,
      }),
    ).rejects.toThrow(ValidationFailedException);
    expect(repository.createUnit).not.toHaveBeenCalled();
  });

  it('gửi lat mà thiếu lng bị từ chối', async () => {
    // `ST_MakePoint` với một `NULL` cho ra `NULL`, tức đơn vị lặng lẽ mất vị trí trên bản đồ.
    await expect(
      new CreateMeritUnitUseCase(makeRepository(), makeAdmin(true)).handle({
        ...unitInput({ lat: 10.7897 }),
        actorUserId: AdminId,
      }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('slug trùng trả thông báo đọc được chứ không để UNIQUE nổ', async () => {
    const repository = makeRepository();
    repository.slugTaken.mockResolvedValue(true);

    await expect(
      new CreateMeritUnitUseCase(repository, makeAdmin(true)).handle({
        ...unitInput(),
        actorUserId: AdminId,
      }),
    ).rejects.toThrow(ValidationFailedException);
    expect(repository.createUnit).not.toHaveBeenCalled();
  });
});

describe('UpdateMeritUnitUseCase', () => {
  it('bỏ qua chính nó khi hỏi slug trùng', async () => {
    // Thiếu `exceptGlobalId` thì sửa tên mà giữ slug cũ sẽ tự báo "slug đã có người dùng".
    const repository = makeRepository();

    await new UpdateMeritUnitUseCase(repository, makeAdmin(true)).handle({
      actorUserId: AdminId,
      unitId: 'unit-1',
      slug: 'chua-vinh-nghiem',
    });

    expect(repository.slugTaken).toHaveBeenCalledWith(
      'chua-vinh-nghiem',
      'unit-1',
    );
  });

  it('chỉ gửi những trường có mặt', async () => {
    const repository = makeRepository();

    await new UpdateMeritUnitUseCase(repository, makeAdmin(true)).handle({
      actorUserId: AdminId,
      unitId: 'unit-1',
      bankAccountNumber: '999988887777',
    });

    expect(repository.updateUnit).toHaveBeenCalledWith({
      unitId: 'unit-1',
      changes: { bankAccountNumber: '999988887777' },
    });
  });

  it('đơn vị không tồn tại thì NotFound', async () => {
    const repository = makeRepository();
    repository.updateUnit.mockResolvedValue(null);

    await expect(
      new UpdateMeritUnitUseCase(repository, makeAdmin(true)).handle({
        actorUserId: AdminId,
        unitId: 'khong-co',
        bankName: 'x',
      }),
    ).rejects.toThrow(MeritUnitNotFoundException);
  });
});

describe('DeclareMeritUseCase', () => {
  it('số tiền CÓ được lưu, đúng con số người dùng khai', async () => {
    // Bên A đã chốt: có lưu. Nhưng nó là LỜI KHAI — xem docblock `models/merit.ts`.
    const repository = makeRepository();

    await new DeclareMeritUseCase(repository).handle({
      actorUserId: DonorId,
      unitId: 'unit-1',
      declaredAmount: 500_000,
      status: 'INTENDED',
    });

    expect(repository.createDeclaration).toHaveBeenCalledWith(
      expect.objectContaining({ declaredAmount: 500_000, status: 'INTENDED' }),
    );
  });

  it('mã VietQR trả về CÓ gắn đúng số tiền vừa khai', async () => {
    const repository = makeRepository();
    repository.createDeclaration.mockResolvedValue(
      declaration({ declaredAmount: 750_000 }),
    );

    const result = await new DeclareMeritUseCase(repository).handle({
      actorUserId: DonorId,
      unitId: 'unit-1',
      declaredAmount: 750_000,
      status: 'INTENDED',
    });

    expect(result.vietQrUrl).toContain('amount=750000');
  });

  it('chỉ khai được cho đơn vị đang HIỆN', async () => {
    // Đơn vị đã tắt là đơn vị Admin đã rút khỏi danh sách — nhận lời khai cho nó là để
    // người dùng chuyển tiền vào một tài khoản mà hệ thống vừa thôi bảo đảm.
    const repository = makeRepository();
    repository.findPublicUnitByIdOrSlug.mockResolvedValue(null);

    await expect(
      new DeclareMeritUseCase(repository).handle({
        actorUserId: DonorId,
        unitId: 'unit-1',
        declaredAmount: 500_000,
        status: 'INTENDED',
      }),
    ).rejects.toThrow(MeritUnitNotFoundException);
    expect(repository.createDeclaration).not.toHaveBeenCalled();
  });

  it('kiểm số tiền TRƯỚC khi đọc database', async () => {
    const repository = makeRepository();
    await expect(
      new DeclareMeritUseCase(repository).handle({
        actorUserId: DonorId,
        unitId: 'unit-1',
        declaredAmount: 10,
        status: 'INTENDED',
      }),
    ).rejects.toThrow(ValidationFailedException);
    expect(repository.findPublicUnitByIdOrSlug).not.toHaveBeenCalled();
  });

  it('trạng thái ngoài allowlist bị từ chối', async () => {
    await expect(
      new DeclareMeritUseCase(makeRepository()).handle({
        actorUserId: DonorId,
        unitId: 'unit-1',
        declaredAmount: 500_000,
        status: 'VERIFIED',
      }),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('isAnonymous mặc định false — ẩn danh phải do người dùng chọn', async () => {
    const repository = makeRepository();

    await new DeclareMeritUseCase(repository).handle({
      actorUserId: DonorId,
      unitId: 'unit-1',
      declaredAmount: 500_000,
      status: 'INTENDED',
    });

    expect(repository.createDeclaration).toHaveBeenCalledWith(
      expect.objectContaining({ isAnonymous: false }),
    );
  });
});

describe('CompleteMeritDeclarationUseCase', () => {
  it('đổi được thì trả hàng đã cập nhật', async () => {
    const repository = makeRepository();
    repository.markDeclarationCompleted.mockResolvedValue(
      declaration({ status: 'COMPLETED', completedAt: new Date() }),
    );

    const result = await new CompleteMeritDeclarationUseCase(repository).handle(
      {
        actorUserId: DonorId,
        declarationId: 'declaration-1',
      },
    );

    expect(result.status).toBe('COMPLETED');
    // Phép kiểm chủ sở hữu nằm trong WHERE của câu UPDATE, nên không đọc trước.
    expect(repository.findDeclarationByGlobalId).not.toHaveBeenCalled();
  });

  it('lời khai của NGƯỜI KHÁC trả NotFound, không trả Forbidden', async () => {
    // Sự tồn tại của một lời khai ẩn danh là thứ không nên dò được bằng cách thử id.
    const repository = makeRepository();
    repository.markDeclarationCompleted.mockResolvedValue(null);
    repository.findDeclarationByGlobalId.mockResolvedValue(
      declaration({ userId: 'nguoi-khac' }),
    );

    await expect(
      new CompleteMeritDeclarationUseCase(repository).handle({
        actorUserId: DonorId,
        declarationId: 'declaration-1',
      }),
    ).rejects.toThrow(MeritUnitNotFoundException);
  });

  it('lời khai của mình nhưng đã COMPLETED thì AlreadyCompleted', async () => {
    const repository = makeRepository();
    repository.markDeclarationCompleted.mockResolvedValue(null);
    repository.findDeclarationByGlobalId.mockResolvedValue(
      declaration({ status: 'COMPLETED', completedAt: new Date() }),
    );

    await expect(
      new CompleteMeritDeclarationUseCase(repository).handle({
        actorUserId: DonorId,
        declarationId: 'declaration-1',
      }),
    ).rejects.toThrow(MeritDeclarationAlreadyCompletedException);
  });

  it('lời khai không tồn tại thì NotFound', async () => {
    const repository = makeRepository();
    repository.markDeclarationCompleted.mockResolvedValue(null);
    repository.findDeclarationByGlobalId.mockResolvedValue(null);

    await expect(
      new CompleteMeritDeclarationUseCase(repository).handle({
        actorUserId: DonorId,
        declarationId: 'khong-co',
      }),
    ).rejects.toThrow(MeritUnitNotFoundException);
  });
});
