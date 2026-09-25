import {
  PointDailyCapReachedException,
  PointRuleUnavailableException,
} from '@/domain/exceptions';
import {
  AwardGiftCompletionUseCase,
  giftCompletionIdempotencyKey,
} from './award-gift-completion.use-case';

const TransactionId = 'deal-1';
const GiverId = 'giver-1';

function makeUseCase(
  options: {
    grace?: unknown;
    appendResult?: unknown;
    appendError?: unknown;
  } = {},
) {
  const append = {
    handle: options.appendError
      ? jest.fn().mockRejectedValue(options.appendError)
      : jest.fn().mockResolvedValue(
          options.appendResult ?? {
            entryId: 1,
            delta: 50,
            balance: 50,
            rawBalance: 50,
            lifetime: 50,
            applied: true,
          },
        ),
  };
  const adminConfig = {
    getConfigValue: jest
      .fn()
      .mockResolvedValue(
        options.grace ?? { graceDays: 7, defaultAccuracyPercent: 80 },
      ),
  };

  return {
    useCase: new AwardGiftCompletionUseCase(
      append as never,
      adminConfig as never,
    ),
    append,
    adminConfig,
  };
}

describe('AwardGiftCompletionUseCase', () => {
  it('truyền mức người nhận chấm làm hệ số nhân', async () => {
    const { useCase, append } = makeUseCase();

    await useCase.handle({
      transactionId: TransactionId,
      giverId: GiverId,
      accuracyPercent: 90,
      source: 'REVIEW',
    });

    expect(append.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: GiverId,
        ruleCode: 'GIFT_COMPLETED',
        multiplierPercent: 90,
      }),
    );
  });

  it('KHÔNG đọc cấu hình khi đã có đánh giá', async () => {
    // Đọc cấu hình cho mỗi lượt trao có đánh giá là một lượt đi database thừa
    // trên đường đi phổ biến nhất.
    const { useCase, adminConfig } = makeUseCase();

    await useCase.handle({
      transactionId: TransactionId,
      giverId: GiverId,
      accuracyPercent: 90,
      source: 'REVIEW',
    });

    expect(adminConfig.getConfigValue).not.toHaveBeenCalled();
  });

  it('dùng mức mặc định trong cấu hình khi không có đánh giá', async () => {
    const { useCase, append } = makeUseCase();

    const result = await useCase.handle({
      transactionId: TransactionId,
      giverId: GiverId,
      accuracyPercent: null,
      source: 'GRACE_EXPIRED',
    });

    expect(append.handle).toHaveBeenCalledWith(
      expect.objectContaining({ multiplierPercent: 80, actor: 'SYSTEM' }),
    );
    expect(result.usedDefault).toBe(true);
    expect(result.appliedPercent).toBe(80);
  });

  it('cấu hình hỏng thì rơi về mặc định, không ném lỗi', async () => {
    // Một ô nhập liệu gõ nhầm không được làm treo điểm của mọi người tặng.
    const { useCase, append } = makeUseCase({ grace: 'rác' });

    await useCase.handle({
      transactionId: TransactionId,
      giverId: GiverId,
      accuracyPercent: null,
      source: 'GRACE_EXPIRED',
    });

    expect(append.handle).toHaveBeenCalledWith(
      expect.objectContaining({ multiplierPercent: 80 }),
    );
  });

  it('khoá chống trùng theo LƯỢT TRAO, không theo đường kích hoạt', async () => {
    // Đây là điểm tựa của cả cơ chế: hai đường cùng dẫn tới đây, và đường nào
    // tới trước thì đường kia thành không làm gì. Khoá riêng cho mỗi đường là
    // trả thưởng hai lần cho một lượt trao.
    const fromReview = makeUseCase();
    const fromJob = makeUseCase();

    await fromReview.useCase.handle({
      transactionId: TransactionId,
      giverId: GiverId,
      accuracyPercent: 90,
      source: 'REVIEW',
    });
    await fromJob.useCase.handle({
      transactionId: TransactionId,
      giverId: GiverId,
      accuracyPercent: null,
      source: 'GRACE_EXPIRED',
    });

    const keyFromReview = fromReview.append.handle.mock.calls[0][0]
      .idempotencyKey as string;
    const keyFromJob = fromJob.append.handle.mock.calls[0][0]
      .idempotencyKey as string;

    expect(keyFromReview).toBe(keyFromJob);
    expect(keyFromReview).toBe(giftCompletionIdempotencyKey(TransactionId));
  });

  it('báo awarded = false khi bút toán đã tồn tại từ trước', async () => {
    const { useCase } = makeUseCase({
      appendResult: {
        entryId: 1,
        delta: 50,
        balance: 50,
        rawBalance: 50,
        lifetime: 50,
        applied: false,
      },
    });

    const result = await useCase.handle({
      transactionId: TransactionId,
      giverId: GiverId,
      accuracyPercent: 90,
      source: 'REVIEW',
    });

    expect(result.awarded).toBe(false);
  });

  it('chấm 0% vẫn GHI bút toán chứ không bỏ qua', async () => {
    // Bút toán delta = 0 là bằng chứng "đã chấm, và chấm 0". Nó chiếm khoá chống
    // trùng nên job hết hạn chờ sau này KHÔNG trả mức mặc định 80% cho một lượt
    // đã bị chấm 0.
    const { useCase, append } = makeUseCase({
      appendResult: {
        entryId: 1,
        delta: 0,
        balance: 0,
        rawBalance: 0,
        lifetime: 0,
        applied: true,
      },
    });

    const result = await useCase.handle({
      transactionId: TransactionId,
      giverId: GiverId,
      accuracyPercent: 0,
      source: 'REVIEW',
    });

    expect(append.handle).toHaveBeenCalledWith(
      expect.objectContaining({ multiplierPercent: 0 }),
    );
    expect(result.awarded).toBe(true);
    expect(result.points).toBe(0);
  });

  it.each([
    ['rule bị Admin tắt', new PointRuleUnavailableException('GIFT_COMPLETED')],
    ['chạm cap ngày', new PointDailyCapReachedException('GIFT_COMPLETED', 5)],
  ])('nuốt ngoại lệ vận hành: %s', async (_label, error) => {
    // Hai thứ này là quyết định vận hành bình thường. Ném tiếp sẽ làm việc đánh
    // giá thất bại, hoặc làm job đối soát dừng giữa danh sách.
    const { useCase } = makeUseCase({ appendError: error });

    const result = await useCase.handle({
      transactionId: TransactionId,
      giverId: GiverId,
      accuracyPercent: 90,
      source: 'REVIEW',
    });

    expect(result).toMatchObject({ awarded: false, points: 0 });
  });

  it('ném tiếp mọi lỗi khác', async () => {
    // `catch` trống ở đây sẽ biến một sự cố database thành "hôm nay không ai
    // được điểm" mà không ai biết.
    const { useCase } = makeUseCase({
      appendError: new Error('mất kết nối database'),
    });

    await expect(
      useCase.handle({
        transactionId: TransactionId,
        giverId: GiverId,
        accuracyPercent: 90,
        source: 'REVIEW',
      }),
    ).rejects.toThrow('mất kết nối database');
  });
});
