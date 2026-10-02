import {
  DefaultHomeLayout,
  IHomeLayout,
} from '@chantam.vn/chantam.core-lib/models';
import {
  CreateHomeCampaignUseCase,
  GetHomeLayoutUseCase,
  UpdateHomeCampaignUseCase,
} from './home-campaign.use-cases';

const ActorId = '10000000-0000-4000-8000-000000000001';
const CampaignId = '20000000-0000-4000-8000-000000000002';

function record(overrides: Record<string, unknown> = {}) {
  return {
    globalId: CampaignId,
    campaignName: 'Vu Lan 2026',
    theme: DefaultHomeLayout.theme,
    marqueeText: null,
    banners: [],
    sectionsLayout: [...DefaultHomeLayout.sectionsLayout],
    popup: null,
    floatingBanner: null,
    startTime: new Date('2026-08-01T00:00:00Z'),
    endTime: new Date('2026-08-31T00:00:00Z'),
    isActive: true,
    isLive: false,
    createdBy: ActorId,
    updatedBy: ActorId,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

function makeDeps(options: { cacheOk?: boolean; existing?: unknown } = {}) {
  return {
    repository: {
      createCampaign: jest.fn(async (params: Record<string, unknown>) =>
        record(params),
      ),
      updateCampaign: jest.fn(async (params: Record<string, unknown>) =>
        record(params),
      ),
      findByGlobalId: jest.fn(async (_id: string) =>
        options.existing === undefined ? record() : options.existing,
      ),
      findActiveLayout: jest.fn(async (): Promise<IHomeLayout | null> => null),
      listCampaigns: jest.fn(),
    },
    cache: {
      read: jest.fn(async (): Promise<IHomeLayout | null> => null),
      write: jest.fn(async () => undefined),
      invalidate: jest.fn(
        async (): Promise<boolean> => options.cacheOk !== false,
      ),
    },
    admin: {
      hasPermission: jest.fn(
        async (_userId: string, _code: string): Promise<boolean> => true,
      ),
    },
  };
}

const ValidInput = {
  actorUserId: ActorId,
  campaignName: '  Vu Lan 2026  ',
  theme: { primaryColor: '#D97706' },
  marqueeText: '  Triệu tấm lòng  ',
  banners: [],
  sectionsLayout: [...DefaultHomeLayout.sectionsLayout],
  popup: null,
  floatingBanner: null,
  startTime: new Date('2026-08-01T00:00:00Z'),
  endTime: new Date('2026-08-31T00:00:00Z'),
  isActive: true,
};

describe('CreateHomeCampaignUseCase', () => {
  it('cắt khoảng trắng tên và marquee trước khi ghi', async () => {
    const deps = makeDeps();

    await new CreateHomeCampaignUseCase(
      deps.repository as never,
      deps.cache as never,
      deps.admin as never,
    ).handle(ValidInput);

    const params = deps.repository.createCampaign.mock.calls[0][0];
    expect(params.campaignName).toBe('Vu Lan 2026');
    expect(params.marqueeText).toBe('Triệu tấm lòng');
  });

  it('marquee chỉ có khoảng trắng thành null, không thành chuỗi rỗng', async () => {
    const deps = makeDeps();

    await new CreateHomeCampaignUseCase(
      deps.repository as never,
      deps.cache as never,
      deps.admin as never,
    ).handle({ ...ValidInput, marqueeText: '   ' });

    expect(
      deps.repository.createCampaign.mock.calls[0][0].marqueeText,
    ).toBeNull();
  });

  it('CHUẨN HOÁ trước rồi mới KIỂM — khối type lạ không cứu được lượt bật', async () => {
    // Đây là thứ tự quan trọng nhất của cả use case. Kiểm trên dữ liệu thô sẽ thấy
    // "có một khối đang bật" rồi lưu một cấu hình mà khối đó bị loại lúc chuẩn hoá,
    // tức Home bật lên không có khối nào.
    const deps = makeDeps();

    await expect(
      new CreateHomeCampaignUseCase(
        deps.repository as never,
        deps.cache as never,
        deps.admin as never,
      ).handle({
        ...ValidInput,
        sectionsLayout: [
          { id: 'x', type: 'CRYPTO_TICKER', enabled: true, order: 1 },
        ],
      }),
    ).resolves.toBeDefined();

    // `normalizeHomeSections` thay danh sách hỏng bằng bố cục mặc định, nên lượt này
    // KHÔNG bị chặn — nhưng thứ được ghi phải là bố cục mặc định, không phải khối lạ.
    const params = deps.repository.createCampaign.mock.calls[0][0] as {
      sectionsLayout: Array<{ type: string }>;
    };
    expect(params.sectionsLayout.map((s) => s.type)).not.toContain(
      'CRYPTO_TICKER',
    );
    expect(params.sectionsLayout.length).toBeGreaterThan(0);
  });

  it('chặn khi bật mà mọi khối đều tắt', async () => {
    const deps = makeDeps();

    await expect(
      new CreateHomeCampaignUseCase(
        deps.repository as never,
        deps.cache as never,
        deps.admin as never,
      ).handle({
        ...ValidInput,
        sectionsLayout: DefaultHomeLayout.sectionsLayout.map((s) => ({
          ...s,
          enabled: false,
        })),
      }),
    ).rejects.toThrow();

    expect(deps.repository.createCampaign).not.toHaveBeenCalled();
  });

  it('chặn khoảng thời gian ngược và KHÔNG ghi gì', async () => {
    const deps = makeDeps();

    await expect(
      new CreateHomeCampaignUseCase(
        deps.repository as never,
        deps.cache as never,
        deps.admin as never,
      ).handle({
        ...ValidInput,
        startTime: new Date('2026-09-01T00:00:00Z'),
        endTime: new Date('2026-08-01T00:00:00Z'),
      }),
    ).rejects.toThrow();

    expect(deps.repository.createCampaign).not.toHaveBeenCalled();
    expect(deps.cache.invalidate).not.toHaveBeenCalled();
  });

  it('xoá đệm SAU khi ghi, không trước', async () => {
    // Xoá trước rồi ghi lỗi nghĩa là vừa mất đệm vừa không đổi được gì.
    const order: string[] = [];
    const deps = makeDeps();
    deps.repository.createCampaign.mockImplementation(
      async (params: Record<string, unknown>) => {
        order.push('write');
        return record(params);
      },
    );
    deps.cache.invalidate.mockImplementation(async () => {
      order.push('invalidate');
      return true;
    });

    await new CreateHomeCampaignUseCase(
      deps.repository as never,
      deps.cache as never,
      deps.admin as never,
    ).handle(ValidInput);

    expect(order).toEqual(['write', 'invalidate']);
  });

  it('xoá đệm thất bại thì VẪN lưu nhưng báo cacheInvalidated false', async () => {
    // Nuốt im là để Admin bấm Lưu, thấy thành công, mở app vẫn thấy giao diện cũ.
    const deps = makeDeps({ cacheOk: false });

    const result = await new CreateHomeCampaignUseCase(
      deps.repository as never,
      deps.cache as never,
      deps.admin as never,
    ).handle(ValidInput);

    expect(deps.repository.createCampaign).toHaveBeenCalled();
    expect(result.cacheInvalidated).toBe(false);
  });

  it('thiếu quyền campaign.manage thì không ghi và không xoá đệm', async () => {
    const deps = makeDeps();
    deps.admin.hasPermission.mockResolvedValue(false);

    await expect(
      new CreateHomeCampaignUseCase(
        deps.repository as never,
        deps.cache as never,
        deps.admin as never,
      ).handle(ValidInput),
    ).rejects.toThrow();

    expect(deps.repository.createCampaign).not.toHaveBeenCalled();
    expect(deps.cache.invalidate).not.toHaveBeenCalled();
  });
});

describe('UpdateHomeCampaignUseCase', () => {
  it('không tìm thấy thì 404 trước khi chạm UPDATE', async () => {
    // Để `updateCampaign` trả 0 dòng sẽ nổ ở `toRecord(rows[0])` với một TypeError
    // không nói lên gì.
    const deps = makeDeps({ existing: null });

    await expect(
      new UpdateHomeCampaignUseCase(
        deps.repository as never,
        deps.cache as never,
        deps.admin as never,
      ).handle({ ...ValidInput, campaignId: CampaignId }),
    ).rejects.toThrow();

    expect(deps.repository.updateCampaign).not.toHaveBeenCalled();
  });

  it('truyền đúng globalId xuống repository', async () => {
    const deps = makeDeps();

    await new UpdateHomeCampaignUseCase(
      deps.repository as never,
      deps.cache as never,
      deps.admin as never,
    ).handle({ ...ValidInput, campaignId: CampaignId });

    expect(deps.repository.updateCampaign.mock.calls[0][0].globalId).toBe(
      CampaignId,
    );
  });
});

describe('GetHomeLayoutUseCase', () => {
  it('có đệm thì KHÔNG hỏi database', async () => {
    const deps = makeDeps();
    deps.cache.read.mockResolvedValue(DefaultHomeLayout);

    const result = await new GetHomeLayoutUseCase(
      deps.repository as never,
      deps.cache as never,
    ).handle();

    expect(result.fromCache).toBe(true);
    expect(deps.repository.findActiveLayout).not.toHaveBeenCalled();
  });

  it('không chiến dịch nào thì trả bố cục MẶC ĐỊNH, không trả null — BR_CAMP_02', async () => {
    const deps = makeDeps();

    const result = await new GetHomeLayoutUseCase(
      deps.repository as never,
      deps.cache as never,
    ).handle();

    expect(result.layout).toEqual(DefaultHomeLayout);
    expect(result.layout.campaignId).toBeNull();
    expect(result.fromCache).toBe(false);
  });

  it('bố cục mặc định cũng được GHI vào đệm', async () => {
    // Cái đệm ở đây là kết luận "hiện không có chiến dịch nào". Không đệm thì mọi lượt
    // mở app trong cả tháng không có chiến dịch đều đi một truy vấn.
    const deps = makeDeps();

    await new GetHomeLayoutUseCase(
      deps.repository as never,
      deps.cache as never,
    ).handle();

    expect(deps.cache.write).toHaveBeenCalledWith(DefaultHomeLayout);
  });

  it('có chiến dịch thì trả chiến dịch và đệm chính nó', async () => {
    const deps = makeDeps();
    const layout = { ...DefaultHomeLayout, campaignId: CampaignId };
    deps.repository.findActiveLayout.mockResolvedValue(layout);

    const result = await new GetHomeLayoutUseCase(
      deps.repository as never,
      deps.cache as never,
    ).handle();

    expect(result.layout.campaignId).toBe(CampaignId);
    expect(deps.cache.write).toHaveBeenCalledWith(layout);
  });

  it('công khai — không hỏi quyền nào', async () => {
    const deps = makeDeps();

    await new GetHomeLayoutUseCase(
      deps.repository as never,
      deps.cache as never,
    ).handle();

    expect(deps.admin.hasPermission).not.toHaveBeenCalled();
  });
});
