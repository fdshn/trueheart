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
    redemption?: unknown;
    maxValueVnd?: unknown;
    bonusDelta?: number;
    pendingValueBonuses?: {
      transactionId: string;
      giverId: string;
      completedAt: Date;
      accuracyPercent: number | null;
      estimatedValueVnd: number | null;
    }[];
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
    findUnsettledValueBonuses: jest
      .fn()
      .mockResolvedValue(options.pendingValueBonuses ?? []),
  };
  // Mock phân biệt theo KHOÁ. Trả một giá trị cho mọi khoá thì ba lượt đọc cấu hình
  // của job cùng nhận cấu hình grace, và phép kiểm sẽ xanh do tình cờ: tỷ lệ
  // VNĐ/điểm rơi về mặc định, trần rơi về mặc định, và không ai thấy gì sai.
  const adminConfig = {
    getConfigValue: jest.fn().mockImplementation((key: string) => {
      if (key === 'review.grace')
        return Promise.resolve(
          options.grace ?? { graceDays: 7, defaultAccuracyPercent: 80 },
        );
      if (key === 'point.redemption')
        return Promise.resolve(options.redemption ?? { vndPerPoint: 2_000 });
      if (key === 'point.value_bonus_max_value_vnd')
        return Promise.resolve(options.maxValueVnd ?? 2_000_000);
      return Promise.resolve(null);
    }),
  };
  const ledger = {
    appendAdjustment: jest.fn().mockResolvedValue({
      entryId: 9,
      delta: options.bonusDelta ?? 450,
      balance: 450,
      rawBalance: 450,
      lifetime: 450,
      applied: true,
    }),
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
    ledger,
    useCase: new SettleGiftRewardsUseCase(
      reviews as never,
      adminConfig as never,
      award as never,
      appendPoint as never,
      ledger as never,
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

  describe('value_bonus tại hạn (CHỐT-14)', () => {
    const due = {
      transactionId: 'deal-bonus',
      giverId: 'giver-bonus',
      completedAt: new Date(),
      accuracyPercent: 90 as number | null,
      estimatedValueVnd: 1_000_000 as number | null,
    };

    it('cộng đúng công thức và ghi lại giá đã dùng', async () => {
      const { useCase, ledger } = makeUseCase({ pendingValueBonuses: [due] });

      const result = await useCase.handle({});

      // 1.000.000 / 2.000 = 500 điểm trần; 500 × 90% = 450.
      expect(ledger.appendAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'giver-bonus',
          ruleCode: 'GIFT_VALUE_BONUS_GIVER',
          delta: 450,
          idempotencyKey: 'GIFT_VALUE_BONUS_GIVER:deal-bonus',
          actor: 'SYSTEM',
        }),
      );
      expect(result.settledValueBonuses).toEqual([
        {
          transactionId: 'deal-bonus',
          giverId: 'giver-bonus',
          points: 450,
          appliedPercent: 90,
          appliedValueVnd: 1_000_000,
          capped: false,
        },
      ]);
    });

    it('CHẶN lỗ in điểm: giá khai trần bị cắt về trần cấu hình', async () => {
      const { useCase, ledger } = makeUseCase({
        pendingValueBonuses: [
          { ...due, estimatedValueVnd: 1_000_000_000, accuracyPercent: 100 },
        ],
        bonusDelta: 1_000,
      });

      const result = await useCase.handle({});

      // Không trần thì 1.000.000.000 / 2.000 = 500.000 điểm trong MỘT lượt trao.
      expect(ledger.appendAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({ delta: 1_000 }),
      );
      expect(result.settledValueBonuses[0]?.capped).toBe(true);
      expect(result.settledValueBonuses[0]?.appliedValueVnd).toBe(2_000_000);
      // Dưới ngưỡng Kim Cương 1.792, nên một giao dịch không đưa ai lên hạng cao nhất.
      expect(result.settledValueBonuses[0]?.points).toBeLessThan(1_792);
    });

    it('lý do ghi lại giá, tỷ lệ và việc đã bị cắt trần', async () => {
      const { useCase, ledger } = makeUseCase({
        pendingValueBonuses: [
          { ...due, estimatedValueVnd: 1_000_000_000, accuracyPercent: 100 },
        ],
      });

      await useCase.handle({});

      const reason = ledger.appendAdjustment.mock.calls[0][0].reason as string;
      expect(reason).toContain('2000000đ');
      expect(reason).toContain('2000đ mỗi điểm');
      expect(reason).toContain('100%');
      expect(reason).toContain('đã cắt theo trần');
    });

    it('KHÔNG ghi bút toán khi bonus bằng 0 — bài không khai giá', async () => {
      const { useCase, ledger } = makeUseCase({
        pendingValueBonuses: [{ ...due, estimatedValueVnd: 0 }],
      });

      const result = await useCase.handle({});

      // Khác đường điểm hoàn tất: ở đó bút toán delta = 0 là bằng chứng "đã chấm,
      // và chấm 0". Ở đây 0 thường chỉ nghĩa là không khai giá.
      expect(ledger.appendAdjustment).not.toHaveBeenCalled();
      expect(result.settledValueBonuses).toEqual([]);
      // Vẫn báo số lượt tới hạn để job không im lặng về việc đã quét gì.
      expect(result.pendingValueBonuses).toBe(1);
    });

    it('không có đánh giá thì dùng mức mặc định của review.grace', async () => {
      const { useCase, ledger } = makeUseCase({
        pendingValueBonuses: [{ ...due, accuracyPercent: null }],
      });

      await useCase.handle({});

      // 500 điểm trần × 80% mặc định = 400.
      expect(ledger.appendAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({ delta: 400 }),
      );
    });

    it('dry-run không ghi bút toán nào nhưng vẫn báo số tới hạn', async () => {
      const { useCase, ledger } = makeUseCase({ pendingValueBonuses: [due] });

      const result = await useCase.handle({ dryRun: true });

      expect(ledger.appendAdjustment).not.toHaveBeenCalled();
      expect(result.pendingValueBonuses).toBe(1);
      expect(result.settledValueBonuses).toEqual([]);
    });

    it('báo trần đang cấu hình để job nói ra nó đã dùng con số nào', async () => {
      const { useCase } = makeUseCase({ maxValueVnd: 5_000_000 });

      expect((await useCase.handle({})).maxValueVnd).toBe(5_000_000);
    });

    it('trần cấu hình hỏng thì rơi về mặc định, KHÔNG tắt thưởng', async () => {
      const { useCase, ledger } = makeUseCase({
        pendingValueBonuses: [due],
        maxValueVnd: 'nhiều',
      });

      await useCase.handle({});

      // Tắt im lặng là người tặng mất điểm mà không ai biết vì sao.
      expect(ledger.appendAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({ delta: 450 }),
      );
    });
  });
});
