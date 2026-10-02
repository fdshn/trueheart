import { NotifyLunarObservanceUseCase } from './notify-lunar-observance.use-case';

function makeDeps(
  options: { holiday?: unknown; users?: number; created?: boolean } = {},
) {
  const total = options.users ?? 3;
  const users = Array.from({ length: total }, (_, i) => ({
    id: i + 1,
    globalId: `u-${i + 1}`,
  }));

  return {
    holidays: {
      findByLunarDate: jest.fn(async (_m: number, _d: number) =>
        options.holiday === undefined ? null : options.holiday,
      ),
      listAll: jest.fn(),
      replaceAll: jest.fn(),
    },
    audience: {
      findActiveUserIdsAfter: jest.fn(
        async (params: { afterId: number; limit: number }) =>
          users.filter((u) => u.id > params.afterId).slice(0, params.limit),
      ),
    },
    dispatch: {
      handle: jest.fn(async (_c: Record<string, unknown>) => ({
        created: options.created !== false,
        pushedDevices: 0,
      })),
    },
  };
}

function build(deps: ReturnType<typeof makeDeps>) {
  return new NotifyLunarObservanceUseCase(
    deps.holidays as never,
    deps.audience as never,
    deps.dispatch as never,
  );
}

// 27/08/2026 = 15/07 ÂL (Rằm, Vu Lan). 22/08/2026 = 10/07 ÂL (ngày thường).
const RamThang7 = new Date('2026-08-27T03:00:00Z');
const NgayThuong = new Date('2026-08-22T03:00:00Z');
const MungMot = new Date('2026-02-17T03:00:00Z');

describe('NotifyLunarObservanceUseCase', () => {
  it('ngày thường thì thoát sớm, KHÔNG lặp người dùng nào', async () => {
    // ~25 ngày mỗi tháng rơi vào đây. Lặp hết người dùng để rồi không gửi gì là tốn vô
    // ích, và cron chạy mỗi ngày nên nó tốn mỗi ngày.
    const deps = makeDeps();

    const result = await build(deps).handle({ at: NgayThuong });

    expect(result.skipped).toBe(true);
    expect(result.lunarDate).toBe('10/07');
    expect(deps.audience.findActiveUserIdsAfter).not.toHaveBeenCalled();
    expect(deps.dispatch.handle).not.toHaveBeenCalled();
  });

  it('`skipped` KHÁC `notified: 0` — hai tín hiệu riêng', async () => {
    // Một là "hôm nay không có gì để nhắc", một là "có mốc mà không gửi được cho ai".
    const quiet = await build(makeDeps()).handle({ at: NgayThuong });
    const noUsers = await build(makeDeps({ users: 0 })).handle({
      at: RamThang7,
    });

    expect(quiet.skipped).toBe(true);
    expect(noUsers.skipped).toBe(false);
    expect(quiet.notified).toBe(0);
    expect(noUsers.notified).toBe(0);
  });

  it('ngày Rằm gửi cho mọi người đang hoạt động', async () => {
    const deps = makeDeps({ users: 3 });

    const result = await build(deps).handle({ at: RamThang7 });

    expect(result.skipped).toBe(false);
    expect(result.observance).toBe('FULL_MOON');
    expect(result.audience).toBe(3);
    expect(result.notified).toBe(3);
    expect(deps.dispatch.handle).toHaveBeenCalledTimes(3);
  });

  it('Mùng Một dùng câu khác câu Rằm', async () => {
    const deps = makeDeps();

    await build(deps).handle({ at: MungMot });

    const body = (deps.dispatch.handle.mock.calls[0][0] as { body: string })
      .body;
    expect(body).toContain('Mùng Một');
    expect(body).not.toContain('Ngày Rằm');
  });

  it('ngày lễ ĐÈ lên câu mốc khi có cả hai', async () => {
    // Vu Lan rơi đúng Rằm tháng 7. Nói "Hôm nay là Ngày Rằm" ở đó là bỏ mất điều đáng
    // nói hơn.
    const deps = makeDeps({
      holiday: {
        lunarMonth: 7,
        lunarDay: 15,
        name: 'Đại lễ Vu Lan Báo Hiếu',
        description: null,
        isActive: true,
        sortOrder: 8,
      },
    });

    const result = await build(deps).handle({ at: RamThang7 });

    const call = deps.dispatch.handle.mock.calls[0][0] as {
      title: string;
      body: string;
    };
    expect(result.holidayName).toBe('Đại lễ Vu Lan Báo Hiếu');
    expect(call.title).toBe('Đại lễ Vu Lan Báo Hiếu');
    expect(call.body).toContain('Vu Lan');
    // Vẫn giữ phần chúc của đặc tả.
    expect(call.body).toContain('an lạc');
  });

  it('ngày lễ gửi được dù hôm đó KHÔNG phải mốc Rằm/Mùng Một', async () => {
    // Ví dụ 19/02 ÂL (Quán Thế Âm đản sinh) không phải 14/15 cũng không phải 30/1.
    const deps = makeDeps({
      holiday: {
        lunarMonth: 7,
        lunarDay: 10,
        name: 'Một ngày lễ',
        description: null,
        isActive: true,
        sortOrder: 1,
      },
    });

    const result = await build(deps).handle({ at: NgayThuong });

    expect(result.skipped).toBe(false);
    expect(result.observance).toBeNull();
    expect(result.notified).toBe(3);
  });

  it('khoá chống trùng gắn NGÀY ÂM LỊCH và năm, kèm người nhận', async () => {
    // Chạy lại trong cùng ngày không gửi trùng, mà sang Rằm tháng sau thì vẫn gửi được.
    const deps = makeDeps({ users: 1 });

    await build(deps).handle({ at: RamThang7 });

    const key = (
      deps.dispatch.handle.mock.calls[0][0] as { idempotencyKey: string }
    ).idempotencyKey;
    expect(key).toBe('LUNAR_OBSERVANCE:2026:7:15:u-1');
  });

  it('đã có thông báo từ trước thì đếm vào alreadySent, không vào notified', async () => {
    // `alreadySent` lớn khi chạy lại là DẤU HIỆU TỐT: khoá chống trùng đang làm việc.
    const deps = makeDeps({ users: 2, created: false });

    const result = await build(deps).handle({ at: RamThang7 });

    expect(result.notified).toBe(0);
    expect(result.alreadySent).toBe(2);
    expect(result.audience).toBe(2);
  });

  it('gửi theo LÔ, phân trang theo khoá chứ không theo offset', async () => {
    const deps = makeDeps({ users: 5 });

    await build(deps).handle({ at: RamThang7, batchSize: 2 });

    const afterIds = deps.audience.findActiveUserIdsAfter.mock.calls.map(
      (c) => (c[0] as { afterId: number }).afterId,
    );
    // Lô sau bắt đầu từ id cuối của lô trước: 0 → 2 → 4, rồi lô cuối chỉ có 1 người nên
    // vòng dừng mà không cần một lượt gọi rỗng.
    expect(afterIds).toEqual([0, 2, 4]);
    expect(deps.dispatch.handle).toHaveBeenCalledTimes(5);
  });

  it('một người gửi hỏng KHÔNG dừng cả vòng', async () => {
    // Hỏng ở người thứ hai mà dừng nghĩa là những người còn lại không nhận được gì, vì
    // một người.
    const deps = makeDeps({ users: 4 });
    let n = 0;
    deps.dispatch.handle.mockImplementation(async () => {
      n += 1;
      if (n === 2) throw new Error('hộp thư đầy');
      return { created: true, pushedDevices: 0 };
    });

    const result = await build(deps).handle({ at: RamThang7 });

    expect(result.audience).toBe(4);
    expect(result.notified).toBe(3);
    expect(result.failed).toBe(1);
  });

  it('dry-run không gửi cho ai và không lặp người dùng', async () => {
    const deps = makeDeps();

    const result = await build(deps).handle({ at: RamThang7, dryRun: true });

    expect(result.skipped).toBe(false);
    expect(result.notified).toBe(0);
    expect(deps.audience.findActiveUserIdsAfter).not.toHaveBeenCalled();
    expect(deps.dispatch.handle).not.toHaveBeenCalled();
  });

  it('loại thông báo là LUNAR_OBSERVANCE', async () => {
    const deps = makeDeps({ users: 1 });

    await build(deps).handle({ at: RamThang7 });

    expect(
      (deps.dispatch.handle.mock.calls[0][0] as { type: string }).type,
    ).toBe('LUNAR_OBSERVANCE');
  });
});
