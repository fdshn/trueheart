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
  it('báo khi LÊN hạng, và không kèm cảnh báo sắp tụt', async () => {
    // Trước 29/09 lên hạng im lặng hoàn toàn ở mọi đường, trong khi tụt hạng có
    // hai loại thông báo. Chính lúc vừa lên hạng là lúc người dùng có thêm quyền
    // — quota nhiều hơn, mở SOS ở Bạc — mà không ai nói thì họ không biết mình
    // đang có gì để dùng.
    const { notifier, dispatch } = makeNotifier({
      change: { fromRank: 'MEMBER', toRank: 'SILVER', demoted: false },
    });

    await notifier.afterBalanceChange('u-1');

    expect(dispatch.handle).toHaveBeenCalledTimes(1);
    expect(dispatch.handle).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RANK_PROMOTED' }),
    );
  });

  it('lifetime cao KHÔNG ngăn được cảnh báo — hạng chỉ đọc số dư', async () => {
    // Đây là phép canh cho thay đổi 02/10. Trước đó cấu hình `rank.points_source`
    // bật được `LIFETIME`, và ở chế độ ấy đúng ca này KHÔNG cảnh báo: lifetime 1200
    // còn trên mốc nên hạng "không lung lay" dù số tiêu được chỉ còn 100.
    //
    // Cái núm đó đã gỡ (SRS `BR-POINT-06` và `BR-PROF-RANK-06` cùng cấm nhánh
    // lifetime), nên nay người này PHẢI được cảnh báo — họ thật sự sắp tụt hạng.
    // Fixture để lifetime 1200 đúng bằng bản cũ, để nếu có ai seed lại khoá cấu
    // hình đó thì phép kiểm này đỏ.
    const { notifier, dispatch } = makeNotifier({ balancePoints: 100 });

    await notifier.afterBalanceChange('u-1');

    expect(dispatch.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        type: NotificationTypes.RANK_DEMOTION_WARNING,
        body: expect.stringContaining('Bạn còn 100 điểm'),
      }),
    );
  });
});
