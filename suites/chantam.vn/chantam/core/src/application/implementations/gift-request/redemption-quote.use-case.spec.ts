import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { GetRedemptionQuoteUseCase } from './redemption-quote.use-case';

const PostId = '88888888-8888-4888-8888-888888880001';
const UserId = '99999999-9999-4999-8999-999999990002';

const Tiers = [
  { rank: UserRanks.VIEWER, thresholdPoints: 0 },
  { rank: UserRanks.MEMBER, thresholdPoints: 224 },
  { rank: UserRanks.SILVER, thresholdPoints: 672 },
  { rank: UserRanks.GOLD, thresholdPoints: 896 },
  { rank: UserRanks.DIAMOND, thresholdPoints: 1792 },
];

function makeUseCase(
  options: {
    /** `null` dựng ca "chưa xin" / "bài không có". */
    context?: unknown;
    balance?: number;
    rank?: UserRanks;
    tiers?: { rank: string; thresholdPoints: number }[];
    vndPerPoint?: number;
  } = {},
) {
  const balance = options.balance ?? 1000;
  const rank = options.rank ?? UserRanks.GOLD;

  const requests = {
    findRedemptionContext: jest.fn().mockResolvedValue(
      options.context === undefined
        ? {
            requestGlobalId: 'req-1',
            postStatus: 'PUBLISHED',
            estimatedValueVnd: 200_000,
            // Đồng hồ còn chạy: xem trước chỉ có nghĩa trong hạn xét.
            selectionDeadline: new Date(Date.now() + 3 * 86_400_000),
            giverId: 'giver-1',
          }
        : options.context,
    ),
  };
  const adminConfig = {
    getConfigValue: jest
      .fn()
      .mockResolvedValue({ vndPerPoint: options.vndPerPoint ?? 2000 }),
  };
  const ledger = {
    getSummary: jest.fn().mockResolvedValue({ balance, lifetime: balance }),
  };
  const ranks = {
    getOwnSummary: jest
      .fn()
      .mockResolvedValue({ rank, balancePoints: balance }),
    listTiers: jest.fn().mockResolvedValue(options.tiers ?? Tiers),
  };

  return {
    useCase: new GetRedemptionQuoteUseCase(
      requests as never,
      adminConfig as never,
      ledger as never,
      ranks as never,
    ),
    ranks,
  };
}

describe('GetRedemptionQuoteUseCase · sàn giữ hạng (CHỐT-13)', () => {
  it('báo phần giữ hạng và phần dùng được, không chỉ số dư', async () => {
    // Vàng cần 896. Có 1.000 thì giữ 896, dùng được 104. Hiện mỗi `balancePoints`
    // rồi báo không đủ điểm là một câu người dùng không giải thích được.
    const { useCase } = await makeUseCase({ balance: 1000 });

    const { quote } = await useCase.handle({ postId: PostId, userId: UserId });

    expect(quote).toMatchObject({
      balancePoints: 1000,
      reservedForRankPoints: 896,
      availablePoints: 104,
    });
  });

  it('`missingPoints` so với phần DÙNG ĐƯỢC, không với số dư', async () => {
    // Món 500 điểm (1.000.000đ / 2.000). Dùng được 104 → thiếu 396, không phải 0.
    // Bản tới 10/10 trả `missingPoints: 0` ở đúng ca này vì nó so với số dư.
    const { useCase } = await makeUseCase({
      balance: 1000,
      context: {
        requestGlobalId: 'req-1',
        postStatus: 'PUBLISHED',
        estimatedValueVnd: 1_000_000,
        selectionDeadline: new Date(Date.now() + 3 * 86_400_000),
        giverId: 'giver-1',
      },
    });

    const { quote } = await useCase.handle({ postId: PostId, userId: UserId });

    expect(quote.points).toBe(500);
    expect(quote.missingPoints).toBe(396);
    expect(quote.unavailableReason).toBe('INSUFFICIENT_POINTS');
  });

  it('KHÔNG còn trả wouldDemote / rankAfter', async () => {
    // Hai trường đó là giao diện của F76 và đã bị gỡ cùng CHỐT-13. Phép kiểm này
    // canh chúng không quay lại: một lượt đổi được thì không bao giờ tụt hạng, nên
    // chúng là hằng số — và một trường hằng trong contract là một trường client
    // phải đọc tài liệu để biết là bỏ qua được.
    const { useCase } = await makeUseCase({ balance: 1000 });

    const { quote } = await useCase.handle({ postId: PostId, userId: UserId });

    expect(quote).not.toHaveProperty('wouldDemote');
    expect(quote).not.toHaveProperty('rankAfter');
  });

  it('hai nhánh trả sớm vẫn mang theo phần dùng được', async () => {
    // "Bạn dùng được bao nhiêu điểm" không phụ thuộc bài hay giá, nên client vẫn
    // hiện đúng con số ngay cả khi bài này không đổi được. Đó là lý do hai trường
    // đó nằm trong `base`, không nằm ở nhánh cuối.
    const { useCase } = await makeUseCase({ balance: 1000, context: null });

    const { quote } = await useCase.handle({ postId: PostId, userId: UserId });

    expect(quote.unavailableReason).toBe('NOT_AVAILABLE');
    expect(quote).toMatchObject({
      reservedForRankPoints: 896,
      availablePoints: 104,
    });
  });

  it('bảng bậc rỗng thì phần dùng được là 0 — fail-closed', async () => {
    const { useCase } = await makeUseCase({ balance: 1000, tiers: [] });

    const { quote } = await useCase.handle({ postId: PostId, userId: UserId });

    expect(quote.availablePoints).toBe(0);
    expect(quote.reservedForRankPoints).toBe(1000);
  });

  it('VIEWER dùng được trọn số dư', async () => {
    const { useCase } = await makeUseCase({
      balance: 500,
      rank: UserRanks.VIEWER,
    });

    const { quote } = await useCase.handle({ postId: PostId, userId: UserId });

    expect(quote).toMatchObject({
      reservedForRankPoints: 0,
      availablePoints: 500,
      missingPoints: 0,
      unavailableReason: null,
    });
  });

  it('đọc bảng bậc ĐÚNG MỘT lần', async () => {
    // Trước 11/10 có hai lượt đọc: một cho `rankAfter`, một cho sàn. Hai lượt đọc
    // cùng một bảng trong một request là hai câu trả lời có thể khác nhau.
    const { useCase, ranks } = await makeUseCase({ balance: 1000 });

    await useCase.handle({ postId: PostId, userId: UserId });

    expect(ranks.listTiers).toHaveBeenCalledTimes(1);
  });
});
