import { SettleGiftRewardsUseCase } from './settle-gift-rewards.use-case';

function makeUseCase(
  options: {
    pending?: {
      transactionId: string;
      giverId: string;
      completedAt: Date;
      accuracyPercent: number | null;
    }[];
    pendingReceivers?: {
      transactionId: string;
      receiverId: string;
      completedAt: Date;
    }[];
    grace?: unknown;
    awarded?: boolean;
  } = {},
) {
  const pending = options.pending ?? [
    {
      transactionId: 'deal-1',
      giverId: 'giver-1',
      completedAt: new Date(),
      accuracyPercent: null,
    },
    {
      transactionId: 'deal-2',
      giverId: 'giver-2',
      completedAt: new Date(),
      accuracyPercent: null,
    },
  ];
  const reviews = {
    findUnsettledGiverRewards: jest.fn().mockResolvedValue(pending),
    findUnsettledReceiverRewards: jest
      .fn()
      .mockResolvedValue(options.pendingReceivers ?? []),
  };
  const adminConfig = {
    getConfigValue: jest
      .fn()
      .mockResolvedValue(
        options.grace ?? { graceDays: 7, defaultAccuracyPercent: 80 },
      ),
  };
  const award = {
    handle: jest.fn().mockResolvedValue({
      awarded: options.awarded ?? true,
      points: 45,
      appliedPercent: 80,
      usedDefault: true,
    }),
  };
  const appendPoint = {
    handle: jest.fn().mockResolvedValue({
      entryId: 1,
      delta: 28,
      balance: 28,
      rawBalance: 28,
      lifetime: 28,
      applied: options.awarded ?? true,
    }),
  };

  return {
    useCase: new SettleGiftRewardsUseCase(
      reviews as never,
      adminConfig as never,
      award as never,
      appendPoint as never,
    ),
    reviews,
    award,
    appendPoint,
  };
}

describe('SettleGiftRewardsUseCase', () => {
  it('quét theo số ngày chờ đang cấu hình', async () => {
    const { useCase, reviews } = makeUseCase({
      grace: { graceDays: 3, defaultAccuracyPercent: 70 },
    });

    const result = await useCase.handle({});

    expect(reviews.findUnsettledGiverRewards).toHaveBeenCalledWith({
      graceDays: 3,
      limit: 500,
    });
    expect(result.graceDays).toBe(3);
    expect(result.defaultPercent).toBe(70);
  });

  it('gửi accuracyPercent = null để use case tự đọc mức mặc định', async () => {
    // Truyền sẵn một con số ở đây là nhân bản việc đọc cấu hình ra hai chỗ, và
    // hai chỗ đó sẽ trôi khỏi nhau.
    const { useCase, award } = makeUseCase();

    await useCase.handle({});

    expect(award.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        accuracyPercent: null,
        source: 'GRACE_EXPIRED',
      }),
    );
  });

  it('xử lý từng lượt một, không gộp', async () => {
    const { useCase, award } = makeUseCase();

    const result = await useCase.handle({});

    expect(award.handle).toHaveBeenCalledTimes(2);
    expect(result.settled).toHaveLength(2);
  });

  it('dry-run không cộng điểm nào nhưng vẫn báo số lượt tồn', async () => {
    const { useCase, award } = makeUseCase();

    const result = await useCase.handle({ dryRun: true });

    expect(award.handle).not.toHaveBeenCalled();
    expect(result.pending).toBe(2);
    expect(result.settled).toHaveLength(0);
  });

  it('không tính vào settled những lượt không cộng được', async () => {
    // Rule bị tắt hoặc chạm cap ngày: vẫn nằm trong `pending` để người vận hành
    // biết còn việc tồn, nhưng không được báo là đã trả.
    const { useCase } = makeUseCase({ awarded: false });

    const result = await useCase.handle({});

    expect(result.pending).toBe(2);
    expect(result.settled).toHaveLength(0);
  });

  it('tôn trọng limit truyền vào', async () => {
    const { useCase, reviews } = makeUseCase();

    await useCase.handle({ limit: 10 });

    expect(reviews.findUnsettledGiverRewards).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 }),
    );
  });

  it('danh sách rỗng thì không gọi cộng điểm lần nào', async () => {
    const { useCase, award } = makeUseCase({ pending: [] });

    const result = await useCase.handle({});

    expect(award.handle).not.toHaveBeenCalled();
    expect(result.pending).toBe(0);
  });

  it('lượt ĐÃ đánh giá thì trả đúng mức người nhận chấm, không phải mức mặc định', async () => {
    // Đây là dạng sinh ra khi lần cộng điểm lúc đánh giá bị trần ngày chặn.
    // Áp mức mặc định 80% cho một lượt đã được chấm 40% là trả sai số điểm, và
    // sổ append-only không sửa lại được.
    const { useCase, award } = makeUseCase({
      pending: [
        {
          transactionId: 'deal-9',
          giverId: 'giver-9',
          completedAt: new Date(),
          accuracyPercent: 40,
        },
      ],
    });

    await useCase.handle({});

    expect(award.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        accuracyPercent: 40,
        source: 'CAP_DEFERRED',
      }),
    );
  });

  it('chấm 0% KHÁC không chấm — không bị gộp thành mức mặc định', async () => {
    const { useCase, award } = makeUseCase({
      pending: [
        {
          transactionId: 'deal-0',
          giverId: 'giver-0',
          completedAt: new Date(),
          accuracyPercent: 0,
        },
      ],
    });

    await useCase.handle({});

    expect(award.handle).toHaveBeenCalledWith(
      expect.objectContaining({ accuracyPercent: 0, source: 'CAP_DEFERRED' }),
    );
  });

  it('trả nốt phần thưởng của NGƯỜI NHẬN còn treo', async () => {
    const { useCase, appendPoint } = makeUseCase({
      pending: [],
      pendingReceivers: [
        {
          transactionId: 'deal-r',
          receiverId: 'receiver-r',
          completedAt: new Date(),
        },
      ],
    });

    const result = await useCase.handle({});

    expect(appendPoint.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'receiver-r',
        ruleCode: 'GIFT_COMPLETED_RECEIVER',
        idempotencyKey: 'GIFT_COMPLETED_RECEIVER:deal-r',
      }),
    );
    expect(result.pendingReceivers).toBe(1);
    expect(result.settledReceivers).toHaveLength(1);
  });

  it('dry-run không chạm cả phía người nhận', async () => {
    const { useCase, appendPoint } = makeUseCase({
      pendingReceivers: [
        {
          transactionId: 'deal-r',
          receiverId: 'receiver-r',
          completedAt: new Date(),
        },
      ],
    });

    const result = await useCase.handle({ dryRun: true });

    expect(appendPoint.handle).not.toHaveBeenCalled();
    expect(result.pendingReceivers).toBe(1);
    expect(result.settledReceivers).toHaveLength(0);
  });
});
