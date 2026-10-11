import {
  RedemptionInsufficientPointsException,
  RedemptionNotAvailableException,
  RedemptionPriceUnavailableException,
} from '@/domain/exceptions';
import { RedeemPostWithPointsUseCase } from './redeem-post-with-points.use-case';

const PostId = '88888888-8888-4888-8888-888888880001';
const RequesterId = '99999999-9999-4999-8999-999999990002';
const GiverId = '99999999-9999-4999-8999-999999990001';

/** Mặc định: đồng hồ còn 3 ngày, món 1 triệu, tỷ lệ 2.000 → 500 điểm. */
function context(overrides: Record<string, unknown> = {}) {
  return {
    requestGlobalId: 'req-1',
    giverId: GiverId,
    postStatus: 'PUBLISHED',
    selectionDeadline: new Date(Date.now() + 3 * 24 * 3600 * 1000),
    estimatedValueVnd: 1_000_000,
    ...overrides,
  };
}

function makeUseCase(
  options: {
    context?: unknown;
    balance?: number;
    acceptError?: unknown;
    rate?: number;
    /** Hạng hiện tại, để thử sàn giữ hạng của CHỐT-13. */
    rank?: string;
    /** Bảng bậc. `[]` dựng ca "chưa seed" — fail-closed. */
    tiers?: { rank: string; thresholdPoints: number }[];
  } = {},
) {
  const requests = {
    findRedemptionContext: jest
      .fn()
      .mockResolvedValue(
        options.context === undefined ? context() : options.context,
      ),
    acceptRequest: options.acceptError
      ? jest.fn().mockRejectedValue(options.acceptError)
      : jest.fn().mockResolvedValue({ transactionId: 'tx-1' }),
  };
  const ledger = {
    getSummary: jest
      .fn()
      .mockResolvedValue({ balance: options.balance ?? 2000, lifetime: 2000 }),
    appendAdjustment: jest.fn().mockResolvedValue({
      entryId: 1,
      delta: -500,
      balance: 1500,
      rawBalance: 1500,
      lifetime: 2000,
      applied: true,
    }),
  };
  const adminConfig = {
    getConfigValue: jest
      .fn()
      .mockResolvedValue(
        options.rate === undefined
          ? { vndPerPoint: 2000 }
          : { vndPerPoint: options.rate },
      ),
  };
  // Sàn giữ hạng (CHỐT-13). Mặc định VIEWER + bảng bậc thật, nên ngưỡng là 0 và
  // các phép kiểm cũ vẫn nói về điều chúng vốn nói — không phải vì sàn bị tắt.
  const ranks = {
    getOwnSummary: jest
      .fn()
      .mockResolvedValue({ rank: options.rank ?? 'VIEWER', balancePoints: 0 }),
    listTiers: jest.fn().mockResolvedValue(
      options.tiers ?? [
        { rank: 'VIEWER', thresholdPoints: 0 },
        { rank: 'MEMBER', thresholdPoints: 224 },
        { rank: 'SILVER', thresholdPoints: 672 },
        { rank: 'GOLD', thresholdPoints: 896 },
        { rank: 'DIAMOND', thresholdPoints: 1792 },
      ],
    ),
  };
  const notifier = { announce: jest.fn().mockResolvedValue(undefined) };
  const rankChange = {
    afterBalanceChange: jest.fn().mockResolvedValue(null),
  };

  return {
    useCase: new RedeemPostWithPointsUseCase(
      requests as never,
      ledger as never,
      adminConfig as never,
      ranks as never,
      notifier as never,
      rankChange as never,
    ),
    requests,
    ledger,
    ranks,
    notifier,
    rankChange,
  };
}

const command = { postId: PostId, requesterId: RequesterId };

describe('RedeemPostWithPointsUseCase', () => {
  it('trừ đúng số điểm quy từ giá trị tham khảo', async () => {
    const { useCase, ledger } = makeUseCase();

    const result = await useCase.handle(command);

    expect(ledger.appendAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: RequesterId,
        ruleCode: 'ITEM_REDEMPTION',
        delta: -500,
        idempotencyKey: 'ITEM_REDEMPTION:req-1',
      }),
    );
    expect(result.pointsSpent).toBe(500);
  });

  it('trừ điểm TRƯỚC khi duyệt', async () => {
    // Duyệt trước rồi trừ thì một lỗi ở bước trừ để lại người nhận đã được chốt
    // mà chưa trả gì — món quà đi mất và không có đường đòi.
    const { useCase, ledger, requests } = makeUseCase();

    await useCase.handle(command);

    expect(ledger.appendAdjustment.mock.invocationCallOrder[0]).toBeLessThan(
      requests.acceptRequest.mock.invocationCallOrder[0],
    );
  });

  it('HOÀN điểm khi không chốt được vật phẩm', async () => {
    // Sổ append-only nên không xoá được khoản đã trừ. Để nó nằm đó là lấy điểm
    // của người dùng mà không đưa gì.
    const { useCase, ledger } = makeUseCase({
      acceptError: new Error('hết hàng'),
    });

    await expect(useCase.handle(command)).rejects.toThrow('hết hàng');

    expect(ledger.appendAdjustment).toHaveBeenCalledTimes(2);
    expect(ledger.appendAdjustment.mock.calls[1][0]).toMatchObject({
      delta: 500,
      idempotencyKey: 'ITEM_REDEMPTION:REFUND:req-1',
    });
  });

  it('chưa gửi yêu cầu xin nhận thì không đổi được', async () => {
    // F75: "người xin có hai đường — chờ, hoặc dùng điểm". Cho người ngoài nhảy
    // vào đổi là biến hàng đợi thành trang trí.
    const { useCase, ledger } = makeUseCase({ context: null });

    await expect(useCase.handle(command)).rejects.toBeInstanceOf(
      RedemptionNotAvailableException,
    );
    expect(ledger.appendAdjustment).not.toHaveBeenCalled();
  });

  it('đồng hồ CHƯA mở thì không đổi được', async () => {
    const { useCase } = makeUseCase({
      context: context({ selectionDeadline: null }),
    });

    await expect(useCase.handle(command)).rejects.toBeInstanceOf(
      RedemptionNotAvailableException,
    );
  });

  it('đồng hồ ĐÃ hết thì không đổi được', async () => {
    // Job tự chọn chạy mỗi giờ, nên có một khoảng bài đã hết hạn mà chưa ai chốt.
    // Đọc mốc chứ không tin trạng thái bài.
    const { useCase } = makeUseCase({
      context: context({ selectionDeadline: new Date(Date.now() - 1000) }),
    });

    await expect(useCase.handle(command)).rejects.toBeInstanceOf(
      RedemptionNotAvailableException,
    );
  });

  it('bài đã có chủ thì không đổi được', async () => {
    const { useCase } = makeUseCase({
      context: context({ postStatus: 'DELIVERING' }),
    });

    await expect(useCase.handle(command)).rejects.toBeInstanceOf(
      RedemptionNotAvailableException,
    );
  });

  it('bài không khai giá thì báo ĐÚNG lý do, không phải "không đủ điểm"', async () => {
    // Người đổi không làm gì sai và cũng không sửa được — câu chung chung sẽ
    // khiến họ thử lại vô ích.
    const { useCase } = makeUseCase({
      context: context({ estimatedValueVnd: null }),
    });

    await expect(useCase.handle(command)).rejects.toBeInstanceOf(
      RedemptionPriceUnavailableException,
    );
  });

  it('không đủ điểm thì chặn TRƯỚC khi ghi sổ', async () => {
    const { useCase, ledger } = makeUseCase({ balance: 499 });

    await expect(useCase.handle(command)).rejects.toBeInstanceOf(
      RedemptionInsufficientPointsException,
    );
    expect(ledger.appendAdjustment).not.toHaveBeenCalled();
  });

  it('đủ đúng bằng số điểm cần thì cho qua', async () => {
    const { useCase } = makeUseCase({ balance: 500 });

    await expect(useCase.handle(command)).resolves.toMatchObject({
      pointsSpent: 500,
    });
  });

  it('báo cho người đổi rằng lượt trao đã mở', async () => {
    const { useCase, notifier } = makeUseCase();

    await useCase.handle(command);

    expect(notifier.announce).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: RequesterId,
        transactionId: 'tx-1',
      }),
    );
  });

  it('dùng tỷ lệ quy đổi Admin cấu hình, không phải hằng trong code', async () => {
    // Tỷ lệ 1.000 thay vì 2.000 → cùng món 1 triệu thành 1.000 điểm.
    const { useCase, ledger } = makeUseCase({ rate: 1000, balance: 5000 });

    await useCase.handle(command);

    expect(ledger.appendAdjustment.mock.calls[0][0].delta).toBe(-1000);
  });

  it('cấu hình tỷ lệ hỏng thì rơi về mặc định, không ném', async () => {
    // Một ô nhập liệu gõ nhầm không được làm chết cả đường đổi vật phẩm.
    const { useCase, ledger } = makeUseCase({ rate: 'rác' as never });

    await useCase.handle(command);

    expect(ledger.appendAdjustment.mock.calls[0][0].delta).toBe(-500);
  });
  it('xét lại hạng sau khi đổi vật phẩm', async () => {
    // Lỗ đã bịt 29/09. Tiêu điểm làm tụt hạng, nên đổi vật phẩm mà không xét lại
    // là để người hạng Vàng còn 596 điểm vẫn giữ quota 20 bài và quyền SOS họ
    // không còn đủ điều kiện — cho tới khi một biến động điểm KHÔNG liên quan nào
    // đó tình cờ kích hoạt xét lại. Và không có lời cảnh báo nào.
    //
    // `rank-balance.check.ts` từng gọi `reconcileNormalRank` BẰNG TAY sau
    // `appendAdjustment`, nên nó xanh trong khi đường thật hỏng. Phép kiểm này
    // canh chính chỗ nối đó.
    const { useCase, rankChange } = makeUseCase();

    await useCase.handle(command);

    expect(rankChange.afterBalanceChange).toHaveBeenCalledWith(RequesterId);
  });

  it('hoàn điểm khi duyệt hỏng cũng xét lại hạng', async () => {
    // Khoản trừ có thể đã kéo họ tụt hạng; khoản hoàn phải đưa hạng trở lại.
    const { useCase, requests, rankChange } = makeUseCase();
    requests.acceptRequest.mockRejectedValue(new Error('hết hàng'));

    await expect(useCase.handle(command)).rejects.toThrow('hết hàng');

    expect(rankChange.afterBalanceChange).toHaveBeenCalledWith(RequesterId);
  });
});

describe('RedeemPostWithPointsUseCase · sàn giữ hạng (CHỐT-13)', () => {
  it('CHẶN khi số điểm đổi ăn vào phần giữ hạng', async () => {
    // Vàng cần 896. Có 1.000 thì dùng được 104. Món 500 điểm phải bị chặn, dù số
    // dư 1.000 > 500 — đây đúng là ca mà bản tới 10/10 cho qua.
    const { useCase, ledger } = makeUseCase({
      balance: 1000,
      rank: 'GOLD',
      context: context({ estimatedValueVnd: 1_000_000 }),
      rate: 2000,
    });

    await expect(
      useCase.handle({ postId: PostId, requesterId: RequesterId }),
    ).rejects.toBeInstanceOf(RedemptionInsufficientPointsException);

    // Và KHÔNG trừ điểm. Chặn mà vẫn trừ là tệ hơn không chặn.
    expect(ledger.appendAdjustment).not.toHaveBeenCalled();
  });

  it('CHO QUA khi số điểm đổi nằm trong phần dùng được', async () => {
    // Vàng, 1.000 điểm, dùng được 104. Món 100 điểm (200.000đ / 2.000) đi qua.
    const { useCase, ledger } = makeUseCase({
      balance: 1000,
      rank: 'GOLD',
      context: context({ estimatedValueVnd: 200_000 }),
      rate: 2000,
    });

    await useCase.handle({ postId: PostId, requesterId: RequesterId });

    expect(ledger.appendAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ delta: -100 }),
    );
  });

  it('bảng bậc RỖNG thì chặn — fail-closed', async () => {
    // Bảng chưa seed là môi trường sai cấu hình. Cho tiêu lúc đó là âm thầm bỏ
    // đúng cái bảo vệ vừa dựng lại.
    const { useCase } = makeUseCase({
      balance: 1000,
      rank: 'GOLD',
      tiers: [],
      context: context({ estimatedValueVnd: 200_000 }),
      rate: 2000,
    });

    await expect(
      useCase.handle({ postId: PostId, requesterId: RequesterId }),
    ).rejects.toBeInstanceOf(RedemptionInsufficientPointsException);
  });

  it('VIEWER tiêu được trọn số dư — không có gì để giữ', async () => {
    const { useCase, ledger } = makeUseCase({
      balance: 100,
      rank: 'VIEWER',
      context: context({ estimatedValueVnd: 200_000 }),
      rate: 2000,
    });

    await useCase.handle({ postId: PostId, requesterId: RequesterId });

    expect(ledger.appendAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ delta: -100 }),
    );
  });
});
