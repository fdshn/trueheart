import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { QualifyReferralUseCase } from './qualify-referral.use-case';

const RefereeId = '10000000-0000-4000-8000-000000000001';
const ReferrerId = '20000000-0000-4000-8000-000000000002';

function makeUseCase(result: {
  qualified: boolean;
  referrerId?: string;
  awardedPoints?: number;
}) {
  const referrals = { qualifyAndAward: jest.fn(async () => result) };
  const rank = { afterBalanceChange: jest.fn().mockResolvedValue(null) };
  const notifier = {
    handle: jest.fn(async (_command: { body: string }) => undefined),
  };

  return {
    referrals,
    rank,
    notifier,
    useCase: new QualifyReferralUseCase(
      referrals as never,
      rank as never,
      notifier as never,
    ),
  };
}

describe('QualifyReferralUseCase', () => {
  it('thử ghi nhận giới thiệu sau khi referee thành Thành viên', async () => {
    const { referrals, useCase } = makeUseCase({ qualified: false });
    await useCase.handle({ refereeId: RefereeId });

    expect(referrals.qualifyAndAward).toHaveBeenCalledWith({
      refereeId: RefereeId,
    });
  });

  it('BÁO cho người giới thiệu, kèm đúng số điểm đã ghi sổ', async () => {
    // Trước 30/09 cả đường này im lặng với người mời: họ mời xong là hết, không
    // biết mình vừa có 56 điểm — mà đó là thứ khiến họ mời tiếp.
    const { notifier, useCase } = makeUseCase({
      qualified: true,
      referrerId: ReferrerId,
      awardedPoints: 56,
    });
    await useCase.handle({ refereeId: RefereeId });

    expect(notifier.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ReferrerId,
        type: NotificationTypes.REFERRAL_QUALIFIED,
        // Khoá theo NGƯỜI ĐƯỢC GIỚI THIỆU, đúng khoá bút toán dùng: một lượt giới
        // thiệu chỉ đủ điều kiện một lần, nên `point:reconcile` gọi lại không rung
        // điện thoại lần hai.
        idempotencyKey: `REFERRAL_QUALIFIED:${RefereeId}`,
      }),
    );
    expect(notifier.handle.mock.calls[0]?.[0].body).toContain('+56 điểm');
  });

  it('thiếu số điểm thì KHÔNG nói một con số bịa', async () => {
    // Nói "+undefined điểm" tệ hơn không nói con số nào.
    const { notifier, useCase } = makeUseCase({
      qualified: true,
      referrerId: ReferrerId,
    });
    await useCase.handle({ refereeId: RefereeId });

    const body = notifier.handle.mock.calls[0]?.[0].body ?? '';
    expect(body).not.toContain('undefined');
    expect(body).toContain('hoàn tất onboarding');
  });

  it('xét lại hạng CHỈ khi lượt giới thiệu vừa được ghi', async () => {
    const { rank, useCase } = makeUseCase({
      qualified: true,
      referrerId: ReferrerId,
    });
    await useCase.handle({ refereeId: RefereeId });

    // Qua notifier, không phải `reconcileNormalRank` trần: 56 điểm giới thiệu có
    // thể đẩy người ta lên hạng, và họ nên được biết.
    expect(rank.afterBalanceChange).toHaveBeenCalledWith(ReferrerId);
  });

  it('gọi lại mà không đổi gì thì KHÔNG báo và KHÔNG xét hạng', async () => {
    const { rank, notifier, useCase } = makeUseCase({ qualified: false });
    await useCase.handle({ refereeId: RefereeId });

    expect(notifier.handle).not.toHaveBeenCalled();
    expect(rank.afterBalanceChange).not.toHaveBeenCalled();
  });
});
