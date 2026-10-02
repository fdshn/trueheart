import {
  DefaultAffiliatePolicy,
  affiliatePolicyGaps,
  affiliateRewardIdempotencyKey,
  distributeAffiliatePoints,
  normalizeAffiliatePolicy,
  resolveAffiliateLocation,
} from './affiliate';

const Hanoi = { lat: 21.0278, lng: 105.8342 };
const SaiGon = { lat: 10.7724, lng: 106.698 };
const DaNang = { lat: 16.0544, lng: 108.2022 };

describe('resolveAffiliateLocation — thứ tự ưu tiên BR-GEO-AFF-02', () => {
  it('toạ độ sự kiện thắng tất cả', () => {
    expect(
      resolveAffiliateLocation({
        eventLocation: Hanoi,
        transactionLocation: SaiGon,
        postLocation: DaNang,
        memberDefaultLocation: SaiGon,
      }),
    ).toEqual({ location: Hanoi, source: 'EVENT' });
  });

  it('không có sự kiện thì tới lượt trao', () => {
    expect(
      resolveAffiliateLocation({
        transactionLocation: SaiGon,
        postLocation: DaNang,
        memberDefaultLocation: Hanoi,
      }),
    ).toEqual({ location: SaiGon, source: 'TRANSACTION' });
  });

  it('không có lượt trao thì tới bài đăng', () => {
    expect(
      resolveAffiliateLocation({
        postLocation: DaNang,
        memberDefaultLocation: Hanoi,
      }),
    ).toEqual({ location: DaNang, source: 'POST' });
  });

  it('hết toạ độ nghiệp vụ mới lùi về Vị trí mặc định của thành viên', () => {
    // Đây là chỗ quyết ai được thưởng: một người ở Hà Nội đăng bài tặng đồ ở TP.HCM
    // thì sự kiện tính theo vị trí BÀI, không theo nơi họ ở.
    expect(resolveAffiliateLocation({ memberDefaultLocation: Hanoi })).toEqual({
      location: Hanoi,
      source: 'MEMBER_DEFAULT',
    });
  });

  it('không có gì thì NONE, không bịa toạ độ', () => {
    expect(resolveAffiliateLocation({})).toEqual({
      location: null,
      source: 'NONE',
    });
    expect(
      resolveAffiliateLocation({
        eventLocation: null,
        memberDefaultLocation: null,
      }),
    ).toEqual({ location: null, source: 'NONE' });
  });
});

describe('distributeAffiliatePoints — câu A1', () => {
  const people = ['u-1', 'u-2', 'u-3'];

  it('PER_MEMBER: mỗi người nhận ĐỦ số điểm', () => {
    expect(
      distributeAffiliatePoints({
        beneficiaryUserIds: people,
        eventPoints: 10,
        mode: 'PER_MEMBER',
      }),
    ).toEqual([
      { beneficiaryUserId: 'u-1', pointDelta: 10 },
      { beneficiaryUserId: 'u-2', pointDelta: 10 },
      { beneficiaryUserId: 'u-3', pointDelta: 10 },
    ]);
  });

  it('SPLIT_POOL: chia giỏ, phần dư về những người ĐẦU — không bay mất điểm', () => {
    const shares = distributeAffiliatePoints({
      beneficiaryUserIds: people,
      eventPoints: 10,
      mode: 'SPLIT_POOL',
    });

    expect(shares.map((s) => s.pointDelta)).toEqual([4, 3, 3]);
    expect(shares.reduce((sum, s) => sum + s.pointDelta, 0)).toBe(10);
  });

  it('hai cách chênh nhau theo SỐ THÀNH VIÊN — đúng lý do A1 phải chốt', () => {
    const many = Array.from({ length: 500 }, (_, i) => `u-${i}`);
    const total = (mode: 'SPLIT_POOL' | 'PER_MEMBER') =>
      distributeAffiliatePoints({
        beneficiaryUserIds: many,
        eventPoints: 10,
        mode,
      }).reduce((sum, s) => sum + s.pointDelta, 0);

    expect(total('SPLIT_POOL')).toBe(10);
    expect(total('PER_MEMBER')).toBe(5_000);
  });

  it('giỏ nhỏ hơn số người: người sau nhận 0 nhưng VẪN có dòng', () => {
    // BR-AFF-03 đòi lưu đủ dòng để audit, nên "ai lẽ ra được chia" phải giữ lại.
    const shares = distributeAffiliatePoints({
      beneficiaryUserIds: people,
      eventPoints: 2,
      mode: 'SPLIT_POOL',
    });

    expect(shares.map((s) => s.pointDelta)).toEqual([1, 1, 0]);
    expect(shares).toHaveLength(3);
  });

  it('0 điểm hoặc không ai thì không ném, trả dòng 0 điểm', () => {
    expect(
      distributeAffiliatePoints({
        beneficiaryUserIds: people,
        eventPoints: 0,
        mode: 'PER_MEMBER',
      }).every((s) => s.pointDelta === 0),
    ).toBe(true);
    expect(
      distributeAffiliatePoints({
        beneficiaryUserIds: [],
        eventPoints: 10,
        mode: 'SPLIT_POOL',
      }),
    ).toEqual([]);
  });
});

describe('normalizeAffiliatePolicy — fail-closed', () => {
  it('rác trả về bản mặc định KHÔNG phát điểm', () => {
    for (const raw of [null, undefined, 'x', 7, []])
      expect(normalizeAffiliatePolicy(raw)).toEqual(DefaultAffiliatePolicy);
    expect(DefaultAffiliatePolicy.enabled).toBe(false);
    expect(DefaultAffiliatePolicy.dailyCapPerBeneficiary).toBe(0);
  });

  it('chế độ lạ lùi về SPLIT_POOL, không về PER_MEMBER', () => {
    // Lùi về cách chặn trên được tổng điểm là hướng an toàn: `PER_MEMBER` nhân sai
    // lệch với số thành viên.
    for (const mode of ['per_member', 'POOL', 42, null, undefined])
      expect(
        normalizeAffiliatePolicy({ distributionMode: mode }).distributionMode,
      ).toBe('SPLIT_POOL');
    expect(
      normalizeAffiliatePolicy({ distributionMode: 'PER_MEMBER' })
        .distributionMode,
    ).toBe('PER_MEMBER');
  });

  it('điền đủ ba loại sự kiện, loại thiếu thì 0', () => {
    const policy = normalizeAffiliatePolicy({
      eventPoints: { GIFT_COMPLETED: 5, KHONG_TON_TAI: 99 },
    });

    expect(policy.eventPoints).toEqual({
      POST_CREATED: 0,
      GIFT_COMPLETED: 5,
    });
  });

  it('kẹp số âm và vượt trần', () => {
    const policy = normalizeAffiliatePolicy({
      eventPoints: { POST_CREATED: -5, GIFT_COMPLETED: 999_999 },
      dailyCapPerBeneficiary: -1,
      maxBeneficiariesPerEvent: 10_000_000,
    });

    expect(policy.eventPoints.POST_CREATED).toBe(0);
    expect(policy.eventPoints.GIFT_COMPLETED).toBe(1_000);
    expect(policy.dailyCapPerBeneficiary).toBe(0);
    expect(policy.maxBeneficiariesPerEvent).toBe(5_000);
  });

  it('enabled chỉ bật khi đúng true', () => {
    expect(normalizeAffiliatePolicy({ enabled: 'true' }).enabled).toBe(false);
    expect(normalizeAffiliatePolicy({ enabled: 1 }).enabled).toBe(false);
    expect(normalizeAffiliatePolicy({ enabled: true }).enabled).toBe(true);
  });
});

describe('affiliatePolicyGaps', () => {
  it('bản TẮT thì không đòi gì', () => {
    expect(affiliatePolicyGaps(DefaultAffiliatePolicy)).toEqual([]);
  });

  it('bật mà không có TRẦN thì bị chặn — đây là cửa farm điểm', () => {
    const gaps = affiliatePolicyGaps({
      ...DefaultAffiliatePolicy,
      enabled: true,
      eventPoints: { POST_CREATED: 0, GIFT_COMPLETED: 5 },
    });

    expect(gaps).toEqual([
      'dailyCapPerBeneficiary phải lớn hơn 0 khi bật',
      'maxBeneficiariesPerEvent phải lớn hơn 0 khi bật',
    ]);
  });

  it('bật mà mọi loại 0 điểm thì bị chặn — bộ máy chạy không', () => {
    expect(
      affiliatePolicyGaps({
        enabled: true,
        distributionMode: 'SPLIT_POOL',
        eventPoints: { POST_CREATED: 0, GIFT_COMPLETED: 0 },
        dailyCapPerBeneficiary: 50,
        maxBeneficiariesPerEvent: 100,
      }),
    ).toEqual(['cần ít nhất một loại sự kiện có eventPoints lớn hơn 0']);
  });

  it('bản đủ điều kiện thì không còn gap', () => {
    expect(
      affiliatePolicyGaps({
        enabled: true,
        distributionMode: 'SPLIT_POOL',
        eventPoints: { POST_CREATED: 2, GIFT_COMPLETED: 10 },
        dailyCapPerBeneficiary: 50,
        maxBeneficiariesPerEvent: 200,
      }),
    ).toEqual([]);
  });
});

describe('affiliateRewardIdempotencyKey', () => {
  it('khoá gồm đúng ba thành phần của BR-AFF-04 cộng beneficiary', () => {
    const key = affiliateRewardIdempotencyKey({
      beneficiaryUserId: 'u-1',
      eventType: 'GIFT_COMPLETED',
      referenceType: 'GIFT_TRANSACTION',
      referenceId: 'tx-9',
    });

    expect(key).toBe('AFFILIATE:GIFT_COMPLETED:GIFT_TRANSACTION:tx-9:u-1');
  });

  it('đổi BẤT KỲ thành phần nào cũng ra khoá khác', () => {
    const base = {
      beneficiaryUserId: 'u-1',
      eventType: 'GIFT_COMPLETED' as const,
      referenceType: 'GIFT_TRANSACTION',
      referenceId: 'tx-9',
    };
    const keys = new Set([
      affiliateRewardIdempotencyKey(base),
      affiliateRewardIdempotencyKey({ ...base, beneficiaryUserId: 'u-2' }),
      affiliateRewardIdempotencyKey({ ...base, eventType: 'POST_CREATED' }),
      affiliateRewardIdempotencyKey({ ...base, referenceId: 'tx-10' }),
      affiliateRewardIdempotencyKey({ ...base, referenceType: 'POST' }),
    ]);

    expect(keys.size).toBe(5);
  });
});
