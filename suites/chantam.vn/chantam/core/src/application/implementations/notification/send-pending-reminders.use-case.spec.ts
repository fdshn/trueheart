import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { SendPendingRemindersUseCase } from './send-pending-reminders.use-case';

function makeUseCase(
  options: {
    reviews?: {
      transactionId: string;
      receiverId: string;
      daysLeft: number;
    }[];
    cycles?: unknown[];
    grace?: unknown;
    created?: boolean;
  } = {},
) {
  const reviews = {
    findPendingReviewReminders: jest
      .fn()
      .mockResolvedValue(options.reviews ?? []),
  };
  const ranks = {
    findCyclesNeedingReminder: jest
      .fn()
      .mockResolvedValue(options.cycles ?? []),
    markCyclesReminded: jest.fn().mockResolvedValue(undefined),
  };
  const adminConfig = {
    getConfigValue: jest
      .fn()
      .mockResolvedValue(
        options.grace ?? { graceDays: 7, defaultAccuracyPercent: 80 },
      ),
  };
  const dispatch = {
    handle: jest.fn().mockResolvedValue({
      created: options.created ?? true,
      pushedDevices: 0,
    }),
  };

  return {
    useCase: new SendPendingRemindersUseCase(
      reviews as never,
      ranks as never,
      adminConfig as never,
      dispatch as never,
    ),
    reviews,
    ranks,
    dispatch,
  };
}

const pendingReview = {
  transactionId: 'deal-1',
  receiverId: 'receiver-1',
  daysLeft: 4,
};

const pendingCycle = {
  cycleId: '51',
  userId: 'u-1',
  rank: 'SILVER',
  daysLeft: 20,
  giftsDone: 0,
  requiredGifts: 2,
  referralsDone: 1,
  requiredReferrals: 2,
  penaltyPoints: 224,
};

describe('SendPendingRemindersUseCase', () => {
  it('quét lời nhắc đánh giá theo số ngày chờ đang cấu hình', async () => {
    const { useCase, reviews } = makeUseCase({
      grace: { graceDays: 10, defaultAccuracyPercent: 80 },
    });

    await useCase.handle({});

    expect(reviews.findPendingReviewReminders).toHaveBeenCalledWith(
      expect.objectContaining({ graceDays: 10, remindAfterDays: 2 }),
    );
  });

  it('nhắc nhiệm vụ duy trì trước 30 ngày theo SRS', async () => {
    const { useCase, ranks } = makeUseCase();

    await useCase.handle({});

    expect(ranks.findCyclesNeedingReminder).toHaveBeenCalledWith(
      expect.objectContaining({ remindBeforeDays: 30 }),
    );
  });

  it('lời nhắc đánh giá nói rõ còn bao nhiêu ngày', async () => {
    // "Bạn chưa đánh giá" không cho người dùng biết họ còn bao lâu để làm.
    const { useCase, dispatch } = makeUseCase({ reviews: [pendingReview] });

    await useCase.handle({});

    expect(dispatch.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationTypes.REVIEW_REMINDER,
        userId: 'receiver-1',
        body: expect.stringContaining('4 ngày'),
      }),
    );
  });

  it('một lời nhắc đánh giá cho mỗi LƯỢT TRAO, không phải mỗi ngày', async () => {
    // Người không muốn đánh giá đã quyết rồi; nhắc mỗi ngày chỉ khiến họ tắt hết
    // thông báo và từ đó mất luôn thông báo về lượt xin nhận.
    const { useCase, dispatch } = makeUseCase({ reviews: [pendingReview] });

    await useCase.handle({});

    expect(dispatch.handle.mock.calls[0][0].idempotencyKey).toBe(
      'REVIEW_REMINDER:deal-1',
    );
  });

  it('lời nhắc nhiệm vụ nêu tiến độ và mức phạt', async () => {
    // Người dùng cần biết còn thiếu bao nhiêu và mất gì nếu không làm.
    const { useCase, dispatch } = makeUseCase({ cycles: [pendingCycle] });

    await useCase.handle({});

    const body = dispatch.handle.mock.calls[0][0].body as string;
    expect(body).toContain('0/2');
    expect(body).toContain('1/2');
    expect(body).toContain('224');
  });

  it('đánh dấu đã nhắc để vòng quét sau bỏ qua', async () => {
    const { useCase, ranks } = makeUseCase({ cycles: [pendingCycle] });

    await useCase.handle({});

    expect(ranks.markCyclesReminded).toHaveBeenCalledWith(['51']);
  });

  it('đánh dấu đã nhắc CẢ KHI khoá chống trùng đã chặn', async () => {
    // Để trống `reminded_at` là bắt câu quét nạp lại chu kỳ đó mỗi ngày cho tới
    // khi hết hạn, dù không bao giờ gửi được thêm gì.
    const { useCase, ranks } = makeUseCase({
      cycles: [pendingCycle],
      created: false,
    });

    const result = await useCase.handle({});

    expect(ranks.markCyclesReminded).toHaveBeenCalledWith(['51']);
    expect(result.maintenanceReminders).toBe(0);
    expect(result.pendingMaintenance).toBe(1);
  });

  it('dry-run chỉ đếm, không gửi và không đánh dấu', async () => {
    const { useCase, dispatch, ranks } = makeUseCase({
      reviews: [pendingReview],
      cycles: [pendingCycle],
    });

    const result = await useCase.handle({ dryRun: true });

    expect(dispatch.handle).not.toHaveBeenCalled();
    expect(ranks.markCyclesReminded).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      reviewReminders: 0,
      maintenanceReminders: 0,
      pendingReview: 1,
      pendingMaintenance: 1,
    });
  });

  it('không có gì cần nhắc thì không gửi lần nào', async () => {
    const { useCase, dispatch } = makeUseCase();

    const result = await useCase.handle({});

    expect(dispatch.handle).not.toHaveBeenCalled();
    expect(result.pendingReview).toBe(0);
  });
});
