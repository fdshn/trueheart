import {
  GetLunarTodayUseCase,
  ListLunarHolidaysUseCase,
  ReplaceLunarHolidaysUseCase,
} from './lunar.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';

function holidayRow(overrides: Record<string, unknown> = {}) {
  return {
    lunarMonth: 7,
    lunarDay: 15,
    name: 'Đại lễ Vu Lan Báo Hiếu',
    description: null,
    isActive: true,
    sortOrder: 8,
    ...overrides,
  };
}

function makeDeps(options: { holiday?: unknown; allowed?: boolean } = {}) {
  return {
    holidays: {
      listAll: jest.fn(async () => [holidayRow()]),
      findByLunarDate: jest.fn(async (_m: number, _d: number) =>
        options.holiday === undefined ? holidayRow() : options.holiday,
      ),
      replaceAll: jest.fn(
        async (params: { holidays: Array<Record<string, unknown>> }) =>
          params.holidays.map((h, i) => ({ ...h, sortOrder: i + 1 })),
      ),
    },
    admin: {
      hasPermission: jest.fn(
        async (_u: string, _c: string): Promise<boolean> =>
          options.allowed !== false,
      ),
    },
  };
}

describe('GetLunarTodayUseCase', () => {
  it('ngày Rằm tháng 7 (Vu Lan 2026) trả đủ header, can chi, biểu ngữ và ngày lễ', async () => {
    const deps = makeDeps();

    const result = await new GetLunarTodayUseCase(
      deps.holidays as never,
    ).handle({ at: new Date('2026-08-27T03:00:00Z') });

    expect(result.solarDate).toBe('2026-08-27');
    expect(result.lunarDay).toBe(15);
    expect(result.lunarMonth).toBe(7);
    expect(result.canChi).toBe('Bính Ngọ');
    expect(result.header).toBe('27/08/2026 - 15/07 [Bính Ngọ]');
    expect(result.observance).toBe('FULL_MOON');
    expect(result.banner).toContain('Ngày Rằm');
    expect(result.holiday?.name).toBe('Đại lễ Vu Lan Báo Hiếu');
  });

  it('biểu ngữ Mùng Một khác biểu ngữ Rằm', async () => {
    // Đặc tả viết một câu chung cho hai mốc. Tách hai vì client chỉ biết `observance`,
    // và để nó tự chọn chữ là đưa nội dung sản phẩm vào bản app.
    const deps = makeDeps({ holiday: null });

    const result = await new GetLunarTodayUseCase(
      deps.holidays as never,
    ).handle({ at: new Date('2026-02-17T03:00:00Z') });

    expect(result.lunarDay).toBe(1);
    expect(result.observance).toBe('NEW_MOON');
    expect(result.banner).toContain('Mùng Một');
    expect(result.banner).not.toContain('Ngày Rằm');
  });

  it('ngày thường không có biểu ngữ, và đó là null chứ không phải chuỗi rỗng', async () => {
    const deps = makeDeps({ holiday: null });

    const result = await new GetLunarTodayUseCase(
      deps.holidays as never,
    ).handle({ at: new Date('2026-08-22T03:00:00Z') });

    expect(result.observance).toBeNull();
    expect(result.banner).toBeNull();
  });

  it('cắt ngày theo UTC+7, không theo UTC', async () => {
    // 2026-02-16T23:30Z là 17/02 ở Việt Nam — mùng 1 Tết. Đọc theo UTC thì biểu ngữ hiện
    // sai một ngày với nửa số người dùng.
    const deps = makeDeps({ holiday: null });

    const result = await new GetLunarTodayUseCase(
      deps.holidays as never,
    ).handle({ at: new Date('2026-02-16T23:30:00Z') });

    expect(result.solarDate).toBe('2026-02-17');
    expect(result.lunarDay).toBe(1);
  });

  it('tra ngày lễ theo tháng CHÍNH, truyền đúng tham số', async () => {
    const deps = makeDeps();

    await new GetLunarTodayUseCase(deps.holidays as never).handle({
      at: new Date('2026-08-27T03:00:00Z'),
    });

    expect(deps.holidays.findByLunarDate).toHaveBeenCalledWith(7, 15);
  });

  it('công khai — không hỏi quyền nào', async () => {
    const deps = makeDeps();

    await new GetLunarTodayUseCase(deps.holidays as never).handle({});

    expect(deps.admin.hasPermission).not.toHaveBeenCalled();
  });
});

describe('ReplaceLunarHolidaysUseCase', () => {
  const valid = [
    { lunarMonth: 1, lunarDay: 1, name: 'Tết Nguyên Đán' },
    { lunarMonth: 7, lunarDay: 15, name: 'Vu Lan' },
  ];

  it('ghi cả bộ và trả về danh mục đã đánh số thứ tự', async () => {
    const deps = makeDeps();

    const result = await new ReplaceLunarHolidaysUseCase(
      deps.holidays as never,
      deps.admin as never,
    ).handle({ actorUserId: ActorId, holidays: valid });

    expect(result.holidays.map((h) => h.sortOrder)).toEqual([1, 2]);
    expect(deps.holidays.replaceAll).toHaveBeenCalledTimes(1);
  });

  it('cắt khoảng trắng tên và biến mô tả trắng thành null', async () => {
    const deps = makeDeps();

    await new ReplaceLunarHolidaysUseCase(
      deps.holidays as never,
      deps.admin as never,
    ).handle({
      actorUserId: ActorId,
      holidays: [
        { lunarMonth: 1, lunarDay: 1, name: '  Tết  ', description: '   ' },
      ],
    });

    const written = deps.holidays.replaceAll.mock.calls[0][0] as {
      holidays: Array<{ name: string; description: string | null }>;
    };
    expect(written.holidays[0].name).toBe('Tết');
    expect(written.holidays[0].description).toBeNull();
  });

  it('isActive thiếu khoá thì BẬT', async () => {
    const deps = makeDeps();

    await new ReplaceLunarHolidaysUseCase(
      deps.holidays as never,
      deps.admin as never,
    ).handle({ actorUserId: ActorId, holidays: valid });

    const written = deps.holidays.replaceAll.mock.calls[0][0] as {
      holidays: Array<{ isActive: boolean }>;
    };
    expect(written.holidays.every((h) => h.isActive)).toBe(true);
  });

  it('trùng cặp (tháng, ngày) bị chặn TRƯỚC khi ghi', async () => {
    // Khoá UNIQUE cũng chặn, nhưng bằng một lỗi ràng buộc ở giữa vòng chèn — Admin nhận
    // một thông báo nói về tên khoá thay vì nói ngày nào bị trùng.
    const deps = makeDeps();

    await expect(
      new ReplaceLunarHolidaysUseCase(
        deps.holidays as never,
        deps.admin as never,
      ).handle({
        actorUserId: ActorId,
        holidays: [
          { lunarMonth: 7, lunarDay: 15, name: 'Vu Lan' },
          { lunarMonth: 7, lunarDay: 15, name: 'Trung Nguyên' },
        ],
      }),
    ).rejects.toThrow();

    expect(deps.holidays.replaceAll).not.toHaveBeenCalled();
  });

  it('danh mục rỗng bị chặn — tắt từng dòng chứ không xoá hết', async () => {
    const deps = makeDeps();

    await expect(
      new ReplaceLunarHolidaysUseCase(
        deps.holidays as never,
        deps.admin as never,
      ).handle({ actorUserId: ActorId, holidays: [] }),
    ).rejects.toThrow();

    expect(deps.holidays.replaceAll).not.toHaveBeenCalled();
  });

  it('thiếu quyền config.write thì không ghi gì', async () => {
    const deps = makeDeps({ allowed: false });

    await expect(
      new ReplaceLunarHolidaysUseCase(
        deps.holidays as never,
        deps.admin as never,
      ).handle({ actorUserId: ActorId, holidays: valid }),
    ).rejects.toThrow();

    expect(deps.holidays.replaceAll).not.toHaveBeenCalled();
  });
});

describe('ListLunarHolidaysUseCase', () => {
  it('trả cả dòng đã tắt — CMS cần thấy để bật lại', async () => {
    const deps = makeDeps();
    deps.holidays.listAll.mockResolvedValue([
      holidayRow(),
      holidayRow({ lunarMonth: 2, lunarDay: 8, isActive: false }),
    ]);

    const result = await new ListLunarHolidaysUseCase(
      deps.holidays as never,
      deps.admin as never,
    ).handle({ actorUserId: ActorId });

    expect(result.holidays).toHaveLength(2);
    expect(result.holidays.some((h) => !h.isActive)).toBe(true);
  });

  it('thiếu quyền config.read thì từ chối', async () => {
    const deps = makeDeps({ allowed: false });

    await expect(
      new ListLunarHolidaysUseCase(
        deps.holidays as never,
        deps.admin as never,
      ).handle({ actorUserId: ActorId }),
    ).rejects.toThrow();
  });
});
