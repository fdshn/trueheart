import {
  RedemptionInsufficientPointsException,
  RedemptionNotAvailableException,
  RedemptionPriceUnavailableException,
  RedemptionQuoteStaleException,
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
    // Khoản trừ điểm đi KÈM lượt duyệt và được ghi trong cùng transaction
    // (SRS CHỐT-13), nên mock trả `debit` dựng từ chính số điểm được truyền —
    // một mock trả số cố định sẽ xanh cả khi use case truyền sai số.
    acceptRequest: options.acceptError
      ? jest.fn().mockRejectedValue(options.acceptError)
      : jest.fn(async (params: { redemption?: { points: number } }) => ({
          transactionId: 'tx-1',
          giverId: GiverId,
          receiverId: RequesterId,
          debit: params.redemption
            ? {
                entryId: 1,
                delta: -params.redemption.points,
                balance: (options.balance ?? 2000) - params.redemption.points,
                rawBalance:
                  (options.balance ?? 2000) - params.redemption.points,
                lifetime: options.balance ?? 2000,
                applied: true,
              }
            : undefined,
        })),
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

/**
 * `confirmedPoints` là số điểm người dùng đã thấy ở báo giá (CHỐT-10 mục 2). Mặc
 * định khớp bối cảnh mặc định: 1 triệu / 2.000 = 500 điểm. Ca nào đổi giá hoặc
 * đổi tỷ lệ thì phải gửi con số của NÓ — đó chính là điều lát này canh.
 */
const command = {
  postId: PostId,
  requesterId: RequesterId,
  confirmedPoints: 500,
};

describe('RedeemPostWithPointsUseCase', () => {
  it('trừ đúng số điểm quy từ giá trị tham khảo', async () => {
    const { useCase, requests } = makeUseCase();

    const result = await useCase.handle(command);

    expect(requests.acceptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        redemption: expect.objectContaining({
          requesterId: RequesterId,
          points: 500,
          idempotencyKey: 'ITEM_REDEMPTION:req-1',
        }),
      }),
    );
    expect(result.pointsSpent).toBe(500);
  });

  it('trừ điểm TRONG CÙNG transaction với lượt duyệt, không ở lượt riêng', async () => {
    // Tới 11/10 use case gọi `appendAdjustment` (tự mở transaction riêng) rồi mới
    // duyệt. Giữa hai lượt có một khoảng người đổi đã mất điểm mà chưa có suất, và
    // một lần tiến trình chết đúng khoảng ấy là khoản bù không bao giờ được ghi.
    //
    // Phép kiểm này canh đúng chỗ đó: use case KHÔNG được còn đường ghi sổ riêng.
    const { useCase, ledger, requests } = makeUseCase();

    await useCase.handle(command);

    expect(ledger.appendAdjustment).not.toHaveBeenCalled();
    expect(requests.acceptRequest).toHaveBeenCalledWith(
      expect.objectContaining({ redemption: expect.anything() }),
    );
  });

  it('duyệt hỏng thì KHÔNG có bút toán nào để phải hoàn', async () => {
    // Đây là chỗ thay cho ca "HOÀN điểm khi không chốt được vật phẩm" của bản cũ.
    // Khoản trừ nay nằm trong transaction của lượt duyệt, nên lượt duyệt hỏng là
    // khoản trừ cuốn theo — không còn gì để bù, và không còn khoá
    // `ITEM_REDEMPTION:REFUND:<requestId>` nào được ghi.
    const { useCase, ledger } = makeUseCase({
      acceptError: new Error('hết hàng'),
    });

    await expect(useCase.handle(command)).rejects.toThrow('hết hàng');

    expect(ledger.appendAdjustment).not.toHaveBeenCalled();
  });

  it('duyệt hỏng thì cũng KHÔNG xét lại hạng — số dư không đổi', async () => {
    // Bản cũ phải xét lại hạng ở đường lỗi, vì khoản hoàn là một biến động balance
    // thật. Nay transaction rollback nên balance y nguyên, và gọi xét lại hạng chỉ
    // là một lượt đọc database cho một thứ không đổi.
    const { useCase, rankChange } = makeUseCase({
      acceptError: new Error('hết hàng'),
    });

    await expect(useCase.handle(command)).rejects.toThrow('hết hàng');

    expect(rankChange.afterBalanceChange).not.toHaveBeenCalled();
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
    const { useCase, requests } = makeUseCase({ rate: 1000, balance: 5000 });

    // Tỷ lệ khác thì con số xác nhận cũng khác — gửi 500 ở đây là ca "báo giá cũ"
    // và phải bị chặn, không phải ca này.
    await useCase.handle({ ...command, confirmedPoints: 1000 });

    expect(requests.acceptRequest.mock.calls[0][0].redemption.points).toBe(
      1000,
    );
  });

  it('cấu hình tỷ lệ hỏng thì rơi về mặc định, không ném', async () => {
    // Một ô nhập liệu gõ nhầm không được làm chết cả đường đổi vật phẩm.
    const { useCase, requests } = makeUseCase({ rate: 'rác' as never });

    await useCase.handle(command);

    expect(requests.acceptRequest.mock.calls[0][0].redemption.points).toBe(500);
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
});

describe('RedeemPostWithPointsUseCase · báo giá cũ (CHỐT-10 mục 2)', () => {
  it('CHỦ BÀI sửa giá giữa lúc xem và lúc bấm thì chặn, không trừ gì', async () => {
    // Đây là lỗ tới 10/10: người dùng xác nhận 500 điểm, chủ bài nâng giá trị
    // tham khảo lên 2 triệu, và đường bấm tính lại ra 1.000 rồi TRỪ LUÔN.
    const { useCase, ledger, requests } = makeUseCase({
      balance: 5000,
      context: context({ estimatedValueVnd: 2_000_000 }),
    });

    await expect(
      useCase.handle({ ...command, confirmedPoints: 500 }),
    ).rejects.toBeInstanceOf(RedemptionQuoteStaleException);

    expect(ledger.appendAdjustment).not.toHaveBeenCalled();
    expect(requests.acceptRequest).not.toHaveBeenCalled();
  });

  it('ADMIN đổi tỷ lệ giữa lúc xem và lúc bấm thì cũng chặn', async () => {
    // Đầu vào thứ hai, và nó đổi cho MỌI bài cùng lúc — một lần Admin sửa tỷ lệ
    // là mọi báo giá đang mở trên tay người dùng thành cũ.
    const { useCase, ledger } = makeUseCase({ rate: 1000, balance: 5000 });

    await expect(
      useCase.handle({ ...command, confirmedPoints: 500 }),
    ).rejects.toBeInstanceOf(RedemptionQuoteStaleException);

    expect(ledger.appendAdjustment).not.toHaveBeenCalled();
  });

  it('giá RẺ hơn cũng phải xác nhận lại, không âm thầm trừ ít đi', async () => {
    // Trừ ít hơn số đã đồng ý nghe như một món quà, nhưng nó nghĩa là màn hình
    // người dùng đang nói sai về món đồ — và lần sau giá có thể đi hướng kia.
    const { useCase, ledger } = makeUseCase({
      balance: 5000,
      context: context({ estimatedValueVnd: 400_000 }),
    });

    await expect(
      useCase.handle({ ...command, confirmedPoints: 500 }),
    ).rejects.toBeInstanceOf(RedemptionQuoteStaleException);

    expect(ledger.appendAdjustment).not.toHaveBeenCalled();
  });

  it('ném kèm CẢ HAI con số: đã xác nhận và giá hiện tại', async () => {
    // Thiếu con số mới thì client phải gọi lại báo giá chỉ để dựng câu thông báo,
    // và người dùng nhìn một màn hình trống giữa hai lượt gọi.
    const { useCase } = makeUseCase({
      balance: 5000,
      context: context({ estimatedValueVnd: 2_000_000 }),
    });

    const error = await useCase
      .handle({ ...command, confirmedPoints: 500 })
      .catch((caught: unknown) => caught);

    expect((error as Error).message).toContain('500');
    expect((error as Error).message).toContain('1000');
  });

  it('báo giá CŨ bị chặn TRƯỚC khi báo "không đủ điểm"', async () => {
    // Thứ tự có nghĩa: "cần 1.000 điểm, bạn có 300" nhắc một con số người dùng
    // chưa từng thấy, và đẩy họ đi nạp điểm cho một cái giá họ có thể không đồng ý.
    const { useCase } = makeUseCase({
      balance: 300,
      context: context({ estimatedValueVnd: 2_000_000 }),
    });

    await expect(
      useCase.handle({ ...command, confirmedPoints: 500 }),
    ).rejects.toBeInstanceOf(RedemptionQuoteStaleException);
  });

  it('bài không khai giá vẫn báo ĐÚNG lý do, không phải "báo giá cũ"', async () => {
    // `quoteRedemption` trả 0 điểm cho bài không khai giá, và `confirmedPoints`
    // tối thiểu là 1 — nên gộp hai thứ sẽ biến "bài chưa khai giá" thành "giá vừa
    // đổi", một câu sai và không ai sửa được.
    const { useCase } = makeUseCase({
      context: context({ estimatedValueVnd: null }),
    });

    await expect(
      useCase.handle({ ...command, confirmedPoints: 500 }),
    ).rejects.toBeInstanceOf(RedemptionPriceUnavailableException);
  });

  it('khớp thì đi qua bình thường', async () => {
    const { useCase, requests } = makeUseCase({ balance: 5000 });

    await useCase.handle({ ...command, confirmedPoints: 500 });

    expect(requests.acceptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        redemption: expect.objectContaining({ points: 500 }),
      }),
    );
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
      useCase.handle({ ...command, confirmedPoints: 500 }),
    ).rejects.toBeInstanceOf(RedemptionInsufficientPointsException);

    // Và KHÔNG trừ điểm. Chặn mà vẫn trừ là tệ hơn không chặn.
    expect(ledger.appendAdjustment).not.toHaveBeenCalled();
  });

  it('CHO QUA khi số điểm đổi nằm trong phần dùng được', async () => {
    // Vàng, 1.000 điểm, dùng được 104. Món 100 điểm (200.000đ / 2.000) đi qua.
    const { useCase, requests } = makeUseCase({
      balance: 1000,
      rank: 'GOLD',
      context: context({ estimatedValueVnd: 200_000 }),
      rate: 2000,
    });

    await useCase.handle({ ...command, confirmedPoints: 100 });

    expect(requests.acceptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        redemption: expect.objectContaining({ points: 100 }),
      }),
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
      useCase.handle({ ...command, confirmedPoints: 100 }),
    ).rejects.toBeInstanceOf(RedemptionInsufficientPointsException);
  });

  it('VIEWER tiêu được trọn số dư — không có gì để giữ', async () => {
    const { useCase, requests } = makeUseCase({
      balance: 100,
      rank: 'VIEWER',
      context: context({ estimatedValueVnd: 200_000 }),
      rate: 2000,
    });

    await useCase.handle({ ...command, confirmedPoints: 100 });

    expect(requests.acceptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        redemption: expect.objectContaining({ points: 100 }),
      }),
    );
  });
});
