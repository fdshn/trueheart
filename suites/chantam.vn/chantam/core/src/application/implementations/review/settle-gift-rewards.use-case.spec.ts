import { SettleGiftRewardsUseCase } from './settle-gift-rewards.use-case';

function makeUseCase(
  options: {
    pending?: { transactionId: string; giverId: string; completedAt: Date }[];
    grace?: unknown;
    awarded?: boolean;
  } = {},
) {
  const pending = options.pending ?? [
    { transactionId: 'deal-1', giverId: 'giver-1', completedAt: new Date() },
    { transactionId: 'deal-2', giverId: 'giver-2', completedAt: new Date() },
  ];
  const reviews = {
    findUnreviewedCompletions: jest.fn().mockResolvedValue(pending),
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

  return {
    useCase: new SettleGiftRewardsUseCase(
      reviews as never,
      adminConfig as never,
      award as never,
    ),
    reviews,
    award,
  };
}

describe('SettleGiftRewardsUseCase', () => {
  it('quét theo số ngày chờ đang cấu hình', async () => {
    const { useCase, reviews } = makeUseCase({
      grace: { graceDays: 3, defaultAccuracyPercent: 70 },
    });

    const result = await useCase.handle({});

    expect(reviews.findUnreviewedCompletions).toHaveBeenCalledWith({
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

    expect(reviews.findUnreviewedCompletions).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 }),
    );
  });

  it('danh sách rỗng thì không gọi cộng điểm lần nào', async () => {
    const { useCase, award } = makeUseCase({ pending: [] });

    const result = await useCase.handle({});

    expect(award.handle).not.toHaveBeenCalled();
    expect(result.pending).toBe(0);
  });
});
