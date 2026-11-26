import { CharityPointsService } from './charity-points.service';

const CampaignId = 'c1';

function make(options: {
  enabled?: boolean;
  itemPoints?: number;
  percent?: unknown;
  existing?: unknown[];
}) {
  const points = {
    findRule: jest
      .fn()
      .mockImplementation((code: string) =>
        Promise.resolve(
          code === 'CHARITY_MONEY_PLEDGE'
            ? { points: 1, isEnabled: options.enabled ?? true }
            : { points: options.itemPoints ?? 1, isEnabled: true },
        ),
      ),
    findAwards: jest.fn().mockResolvedValue(options.existing ?? []),
    upsertAward: jest.fn().mockResolvedValue({ awardId: 'a1' }),
    settle: jest
      .fn()
      .mockResolvedValue({ applied: 0, deferred: 0, bonusApplied: 0 }),
    listDeliveriesWithoutAward: jest.fn().mockResolvedValue([]),
    zeroAwardsForRemovedPosts: jest.fn().mockResolvedValue(0),
    listUnsettled: jest.fn().mockResolvedValue([]),
  };
  const admin = {
    getConfigValue: jest
      .fn()
      .mockImplementation((key: string) =>
        Promise.resolve(
          key === 'charity.money_pledge.points_percent'
            ? (options.percent ?? 50)
            : 0,
        ),
      ),
  };
  const pledges = {
    listAwardable: jest.fn().mockResolvedValue([
      { pledgeId: 'p1', userId: 'u1', pledgedAmount: 500_000 },
      { pledgeId: 'p2', userId: 'u2', pledgedAmount: 30_000 },
    ]),
    listCampaignsWithUnawardedPledges: jest
      .fn()
      .mockResolvedValue([CampaignId]),
  };
  const service = new CharityPointsService(
    points as never,
    admin as never,
    pledges as never,
  );
  return { service, points, admin, pledges };
}

describe('CharityPointsService.awardMoneyPledges', () => {
  it('mỗi lời khai một award theo % điểm vật phẩm, rồi settle (trần + thưởng chiến dịch)', async () => {
    const { service, points } = make({});
    await service.awardMoneyPledges(CampaignId);
    expect(points.upsertAward).toHaveBeenCalledTimes(2);
    expect(points.upsertAward.mock.calls[0][0]).toMatchObject({
      campaignId: CampaignId,
      userId: 'u1',
      ruleCode: 'CHARITY_MONEY_PLEDGE',
      referenceType: 'CHARITY_MONEY_PLEDGE',
      referenceId: 'p1',
      targetPoints: 25,
    });
    expect(points.upsertAward.mock.calls[1][0].targetPoints).toBe(1);
    expect(points.settle).toHaveBeenCalledTimes(2);
  });

  it('tỷ lệ và mức điểm vật phẩm Admin đổi được', async () => {
    const { service, points } = make({ itemPoints: 2, percent: '100' });
    await service.awardMoneyPledges(CampaignId);
    expect(points.upsertAward.mock.calls[0][0].targetPoints).toBe(100);
  });

  it('rule tắt → không mở award nào', async () => {
    const { service, points, pledges } = make({ enabled: false });
    await service.awardMoneyPledges(CampaignId);
    expect(pledges.listAwardable).not.toHaveBeenCalled();
    expect(points.upsertAward).not.toHaveBeenCalled();
  });

  it('lời khai đã có award → không tính lại (tỷ lệ chốt tại lúc kết thúc)', async () => {
    const { service, points } = make({ existing: [{ awardId: 'old' }] });
    await service.awardMoneyPledges(CampaignId);
    expect(points.upsertAward).not.toHaveBeenCalled();
  });

  it('lỗi một lời khai không chặn lời khai sau, không ném ra ngoài', async () => {
    const { service, points } = make({});
    points.upsertAward
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValueOnce({ awardId: 'a2' });
    await expect(
      service.awardMoneyPledges(CampaignId),
    ).resolves.toBeUndefined();
    expect(points.settle).toHaveBeenCalledTimes(1);
  });

  it('job charity:points vá dự án đã kết thúc còn thiếu award', async () => {
    const { service, pledges, points } = make({});
    const result = await service.settlePending(50);
    expect(pledges.listCampaignsWithUnawardedPledges).toHaveBeenCalledWith(
      30,
      50,
    );
    expect(points.upsertAward).toHaveBeenCalledTimes(2);
    expect(result.backfilled).toBe(1);
  });
});
