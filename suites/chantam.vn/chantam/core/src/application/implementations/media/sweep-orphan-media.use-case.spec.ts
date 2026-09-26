import { SweepOrphanMediaUseCase } from './sweep-orphan-media.use-case';

const Base = 'https://cdn.chantam.test';

function makeDeps(options: {
  rows?: Record<string, { value: string | null }[]>;
  objects?: { key: string; lastModified: Date | null; size: number }[];
}) {
  const rows = options.rows ?? {};

  return {
    manager: {
      query: jest.fn(async (sql: string) => {
        const match = Object.keys(rows).find((table) => sql.includes(table));

        return match ? rows[match] : [];
      }),
    },
    storage: {
      listObjects: jest.fn(async () => ({
        objects: options.objects ?? [],
        nextCursor: null,
      })),
      deleteObjects: jest.fn(async (keys: string[]) => keys.length),
    },
    config: { storage: { publicBaseUrl: Base } },
  };
}

function makeUseCase(deps: ReturnType<typeof makeDeps>) {
  return new SweepOrphanMediaUseCase(
    deps.manager as never,
    deps.storage as never,
    deps.config as never,
  );
}

const old = new Date(Date.now() - 100 * 3_600_000);
const fresh = new Date();

describe('SweepOrphanMediaUseCase', () => {
  it('KHÔNG xoá object đang được database trỏ tới', async () => {
    // Đây là phép kiểm quan trọng nhất của job này: thiếu một nguồn key trong
    // danh sách là xoá sạch ảnh của cả một phân hệ.
    const deps = makeDeps({
      rows: { post_media: [{ value: 'users/u1/posts/p1/media/a.webp' }] },
      objects: [
        { key: 'users/u1/posts/p1/media/a.webp', lastModified: old, size: 10 },
      ],
    });

    const result = await makeUseCase(deps).handle({ dryRun: false });

    expect(result.orphans).toBe(0);
    expect(deps.storage.deleteObjects).not.toHaveBeenCalled();
  });

  it('cắt tiền tố miền để so được URL với key', async () => {
    // `users.avatar_url` lưu URL công khai, `listObjects` trả key. Không cắt
    // thì mọi avatar bị coi là mồ côi.
    const deps = makeDeps({
      rows: { users: [{ value: `${Base}/users/u1/avatars/a.webp` }] },
      objects: [
        { key: 'users/u1/avatars/a.webp', lastModified: old, size: 10 },
      ],
    });

    const result = await makeUseCase(deps).handle({ dryRun: false });

    expect(result.liveKeys).toBe(1);
    expect(result.orphans).toBe(0);
  });

  it('bỏ qua URL trỏ ra ngoài bucket', async () => {
    const deps = makeDeps({
      rows: { reports: [{ value: 'https://example.com/anh.jpg' }] },
      objects: [],
    });

    expect((await makeUseCase(deps).handle({})).liveKeys).toBe(0);
  });

  it('object mới tinh thì KHÔNG đụng vào', async () => {
    // Giữa lúc client PUT xong và lúc gọi xác nhận có một khoảng trống. Quét
    // quá sát là xoá ảnh của người đang upload dở.
    const deps = makeDeps({
      objects: [
        { key: 'users/u1/avatars/moi.webp', lastModified: fresh, size: 5 },
      ],
    });

    const result = await makeUseCase(deps).handle({ dryRun: false });

    expect(result.orphans).toBe(0);
    expect(deps.storage.deleteObjects).not.toHaveBeenCalled();
  });

  it('không có mốc thời gian thì coi như còn mới', async () => {
    const deps = makeDeps({
      objects: [
        { key: 'users/u1/avatars/x.webp', lastModified: null, size: 5 },
      ],
    });

    expect((await makeUseCase(deps).handle({})).orphans).toBe(0);
  });

  it('object cũ và không ai trỏ tới thì là mồ côi', async () => {
    const deps = makeDeps({
      objects: [
        { key: 'users/u1/avatars/cu.webp', lastModified: old, size: 2048 },
      ],
    });

    const result = await makeUseCase(deps).handle({ dryRun: false });

    expect(result.orphans).toBe(1);
    expect(result.reclaimedBytes).toBe(2048);
    expect(deps.storage.deleteObjects).toHaveBeenCalledWith([
      'users/u1/avatars/cu.webp',
    ]);
  });

  it('dry-run ĐẾM nhưng không xoá', async () => {
    const deps = makeDeps({
      objects: [
        { key: 'users/u1/avatars/cu.webp', lastModified: old, size: 1 },
      ],
    });

    const result = await makeUseCase(deps).handle({ dryRun: true });

    expect(result.orphans).toBe(1);
    expect(result.deleted).toBe(0);
    expect(deps.storage.deleteObjects).not.toHaveBeenCalled();
  });
});
