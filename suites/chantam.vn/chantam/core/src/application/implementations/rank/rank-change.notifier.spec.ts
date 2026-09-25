import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { RankChangeNotifier } from './rank-change.notifier';

function makeNotifier(
  options: {
    change?: unknown;
    reconcileError?: unknown;
    balancePoints?: number;
    warningPoints?: number;
    rank?: string;
    dispatchError?: unknown;
  } = {},
) {
  const ranks = {
    reconcileNormalRank: options.reconcileError
      ? jest.fn().mockRejectedValue(options.reconcileError)
      : jest.fn().mockResolvedValue(options.change ?? null),
    getOwnSummary: jest.fn().mockResolvedValue({
      rank: options.rank ?? 'SILVER',
      lifetimePoints: 1200,
      balancePoints: options.balancePoints ?? 700,
      currentTier: {
        rank: options.rank ?? 'SILVER',
        thresholdPoints: 672,
        warningPoints: options.warningPoints ?? 470,
        requiredGifts: 1,
        requiredReferrals: 1,
        postQuota: 10,
      },
      nextTier: null,
      qualifiedReferrals: 2,
      maintenanceCycle: null,
    }),
  };
  const dispatch = {
    handle: options.dispatchError
      ? jest.fn().mockRejectedValue(options.dispatchError)
      : jest.fn().mockResolvedValue({ created: true, pushedDevices: 0 }),
  };

  return {
    notifier: new RankChangeNotifier(ranks as never, dispatch as never),
    ranks,
    dispatch,
  };
}

const demotion = { fromRank: 'GOLD', toRank: 'SILVER', demoted: true };

describe('RankChangeNotifier', () => {
  it('xét lại hạng sau mỗi biến động điểm', async () => {
    const { notifier, ranks } = makeNotifier();

    await notifier.afterBalanceChange('u-1');

    expect(ranks.reconcileNormalRank).toHaveBeenCalledWith('u-1');
  });

  it('báo tụt hạng kèm bậc CŨ và bậc MỚI', async () => {
    // "Hạng của bạn đã thay đổi" không phải một thông báo dùng được.
    const { notifier, dispatch } = makeNotifier({ change: demotion });

    await notifier.afterBalanceChange('u-1');

    expect(dispatch.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationTypes.RANK_DEMOTED,
        body: expect.stringContaining('GOLD'),
      }),
    );
    expect(dispatch.handle.mock.calls[0][0].body).toContain('SILVER');
  });

  it('KHÔNG báo cảnh báo khi vừa báo tụt hạng', async () => {
    // Hai thông báo cho cùng một sự kiện là nhiễu; người đã tụt rồi không cần
    // nghe "bạn sắp tụt".
    const { notifier, dispatch } = makeNotifier({ change: demotion });

    await notifier.afterBalanceChange('u-1');

    expect(dispatch.handle).toHaveBeenCalledTimes(1);
  });

  it('báo cảnh báo khi điểm xuống dưới mốc mà chưa tụt', async () => {
    const { notifier, dispatch } = makeNotifier({ balancePoints: 460 });

    await notifier.afterBalanceChange('u-1');

    expect(dispatch.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationTypes.RANK_DEMOTION_WARNING,
      }),
    );
  });

  it('im lặng khi điểm còn trên mốc cảnh báo', async () => {
    const { notifier, dispatch } = makeNotifier({ balancePoints: 700 });

    await notifier.afterBalanceChange('u-1');

    expect(dispatch.handle).not.toHaveBeenCalled();
  });

  it('bậc không có mốc cảnh báo thì không bao giờ báo', async () => {
    const { notifier, dispatch } = makeNotifier({
      rank: 'VIEWER',
      warningPoints: 0,
      balancePoints: 0,
    });

    await notifier.afterBalanceChange('u-1');

    expect(dispatch.handle).not.toHaveBeenCalled();
  });

  it('khoá cảnh báo theo NGÀY và theo bậc — một lần mỗi ngày', async () => {
    // Không có mốc ngày thì mỗi lượt kiếm 1 điểm rồi tiêu đi cũng đẻ một lời
    // nhắc, người dùng tắt thông báo, và từ đó mất luôn thông báo về lượt xin
    // nhận — thứ thật sự quan trọng.
    const { notifier, dispatch } = makeNotifier({ balancePoints: 460 });

    await notifier.afterBalanceChange('u-1');
    const key = dispatch.handle.mock.calls[0][0].idempotencyKey as string;

    expect(key).toContain('RANK_DEMOTION_WARNING:u-1:SILVER:');
    expect(key).toMatch(/\d{4}-\d{2}-\d{2}$/);
  });

  it('thông báo lỗi KHÔNG làm hỏng bút toán', async () => {
    // Sổ đã ghi rồi; ném ở đây chỉ khiến chỗ gọi tưởng bút toán thất bại.
    const { notifier } = makeNotifier({
      balancePoints: 460,
      dispatchError: new Error('kênh đẩy chết'),
    });

    await expect(notifier.afterBalanceChange('u-1')).resolves.toBeNull();
  });

  it('xét hạng lỗi cũng không ném, và không cố báo gì', async () => {
    const { notifier, dispatch } = makeNotifier({
      reconcileError: new Error('mất kết nối'),
    });

    await expect(notifier.afterBalanceChange('u-1')).resolves.toBeNull();
    expect(dispatch.handle).not.toHaveBeenCalled();
  });

  it('trả lại lần đổi hạng cho chỗ gọi', async () => {
    const { notifier } = makeNotifier({ change: demotion });

    await expect(notifier.afterBalanceChange('u-1')).resolves.toEqual(demotion);
  });
});
