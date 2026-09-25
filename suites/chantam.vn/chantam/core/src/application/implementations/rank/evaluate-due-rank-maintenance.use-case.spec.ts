import { EvaluateDueRankMaintenanceUseCase } from './evaluate-due-rank-maintenance.use-case';

function makeDeps(
  options: {
    pending?: {
      cycleId: string;
      userId: string;
      rank: string;
      penaltyPoints: number;
    }[];
    applied?: boolean;
    demoted?: boolean;
  } = {},
) {
  const ranks = {
    evaluateDueMaintenanceCycles: jest.fn().mockResolvedValue(3),
    findUnpenalizedFailedCycles: jest
      .fn()
      .mockResolvedValue(options.pending ?? []),
    reconcileNormalRank: jest
      .fn()
      .mockResolvedValue(
        options.demoted
          ? { fromRank: 'SILVER', toRank: 'MEMBER', demoted: true }
          : null,
      ),
  };
  const ledger = {
    appendAdjustment: jest.fn().mockResolvedValue({
      entryId: 1,
      delta: -224,
      balance: 448,
      rawBalance: 448,
      lifetime: 672,
      applied: options.applied ?? true,
    }),
  };

  return {
    useCase: new EvaluateDueRankMaintenanceUseCase(
      ranks as never,
      ledger as never,
    ),
    ranks,
    ledger,
  };
}

const silverCycle = {
  cycleId: 'cycle-1',
  userId: 'u-1',
  rank: 'SILVER',
  penaltyPoints: 224,
};

describe('EvaluateDueRankMaintenanceUseCase', () => {
  it('đánh giá chu kỳ tới hạn đúng một lần', async () => {
    const { useCase, ranks } = makeDeps();

    const result = await useCase.handle({});

    expect(ranks.evaluateDueMaintenanceCycles).toHaveBeenCalledTimes(1);
    expect(result.processedCycles).toBe(3);
  });

  it('trượt nhiệm vụ thì TRỪ ĐIỂM, không ép tụt hạng', async () => {
    // Hạng do balance quyết. Ép tụt hạng trực tiếp là tạo hai cơ chế cùng quyết
    // một thứ, rồi lần xét kế tiếp đẩy người ta ngược lên.
    const { useCase, ledger } = makeDeps({ pending: [silverCycle] });

    await useCase.handle({});

    expect(ledger.appendAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        delta: -224,
        ruleCode: 'MAINTENANCE_FAILED',
        idempotencyKey: 'MAINTENANCE_FAILED:cycle-1',
        referenceType: 'RANK_MAINTENANCE_CYCLE',
      }),
    );
  });

  it('khoản trừ luôn kèm lý do đọc được', async () => {
    // "MAINTENANCE_FAILED" không phải câu trả lời cho người bị trừ điểm.
    const { useCase, ledger } = makeDeps({ pending: [silverCycle] });

    await useCase.handle({});

    expect(ledger.appendAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: expect.stringContaining('SILVER'),
      }),
    );
  });

  it('xét lại hạng theo balance mới sau khi trừ', async () => {
    const { useCase, ranks } = makeDeps({
      pending: [silverCycle],
      demoted: true,
    });

    const result = await useCase.handle({});

    expect(ranks.reconcileNormalRank).toHaveBeenCalledWith('u-1');
    expect(result.penalties[0].demoted).toBe(true);
  });

  it('bút toán đã tồn tại thì KHÔNG xét lại hạng lần nữa', async () => {
    // Khoá chống trùng đã chặn khoản trừ, nên balance không đổi và một lượt xét
    // hạng nữa chỉ là lượt đi database vô ích.
    const { useCase, ranks } = makeDeps({
      pending: [silverCycle],
      applied: false,
    });

    const result = await useCase.handle({});

    expect(ranks.reconcileNormalRank).not.toHaveBeenCalled();
    expect(result.penalties).toHaveLength(0);
  });

  it('quét chu kỳ chưa bị trừ RIÊNG, không dùng kết quả bước đánh giá', async () => {
    // Danh sách này gồm cả chu kỳ trượt từ những lần chạy trước mà khoản trừ
    // chưa kịp ghi. Chu kỳ đã FAILED nên vòng đánh giá không nhìn tới nó nữa.
    const { useCase, ranks } = makeDeps({ pending: [silverCycle] });

    await useCase.handle({});

    expect(ranks.findUnpenalizedFailedCycles).toHaveBeenCalledWith(500);
  });

  it('không có chu kỳ trượt nào thì không ghi sổ lần nào', async () => {
    const { useCase, ledger } = makeDeps({ pending: [] });

    const result = await useCase.handle({});

    expect(ledger.appendAdjustment).not.toHaveBeenCalled();
    expect(result.penalties).toEqual([]);
  });
});
