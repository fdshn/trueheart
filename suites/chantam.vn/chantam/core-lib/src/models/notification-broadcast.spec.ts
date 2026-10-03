import {
  AllUsersAudience,
  BroadcastAudienceTypes,
  broadcastAudienceGaps,
  broadcastIdempotencyKey,
  describeBroadcastAudience,
  normalizeBroadcastAudience,
} from './notification-broadcast';

const GroupId = '20000000-0000-4000-8000-000000000002';

describe('normalizeBroadcastAudience', () => {
  it('thiếu hoặc hỏng thì về ALL', () => {
    for (const raw of [null, undefined, 'x', 7])
      expect(normalizeBroadcastAudience(raw)).toEqual(AllUsersAudience);
  });

  it('ALL xoá sạch mọi tham số của chế độ khác', () => {
    // Giữ lại `groupId` hay `radiusMeters` ở chế độ ALL là để lại dữ liệu mà không ai
    // đọc — và một lượt soát sau sẽ tưởng lượt gửi đó có lọc.
    expect(
      normalizeBroadcastAudience({
        type: 'ALL',
        groupId: GroupId,
        radiusMeters: 5_000,
      }),
    ).toEqual(AllUsersAudience);
  });

  it('GROUP giữ groupId, bỏ toạ độ', () => {
    expect(
      normalizeBroadcastAudience({
        type: 'GROUP',
        groupId: GroupId,
        centerLat: 10.7,
      }),
    ).toEqual({
      type: 'GROUP',
      groupId: GroupId,
      centerLat: null,
      centerLng: null,
      radiusMeters: null,
    });
  });

  it('AREA giữ toạ độ và bán kính, bỏ groupId', () => {
    expect(
      normalizeBroadcastAudience({
        type: 'AREA',
        groupId: GroupId,
        centerLat: 10.7724,
        centerLng: 106.698,
        radiusMeters: 5_000,
      }),
    ).toEqual({
      type: 'AREA',
      groupId: null,
      centerLat: 10.7724,
      centerLng: 106.698,
      radiusMeters: 5_000,
    });
  });

  it('toạ độ ngoài khoảng hợp lệ về null, và gaps sẽ chặn', () => {
    const audience = normalizeBroadcastAudience({
      type: 'AREA',
      centerLat: 200,
      centerLng: 106.698,
      radiusMeters: 5_000,
    });
    expect(audience.centerLat).toBeNull();
    expect(broadcastAudienceGaps(audience).length).toBeGreaterThan(0);
  });

  it('type LẠ không lùi về ALL — gaps chặn thay vì gửi cho tất cả', () => {
    // Hướng lùi sai duy nhất ở đây: một bộ lọc đọc không ra mà thành "gửi cho tất cả" là
    // gửi cho trăm nghìn người thay vì cho một nhóm nhỏ.
    const raw = { type: 'THEO_HANG', groupId: GroupId };
    const gaps = broadcastAudienceGaps(normalizeBroadcastAudience(raw), raw);
    expect(gaps.some((g) => g.includes('audience.type phải là'))).toBe(true);
  });

  it('ba chế độ khai báo đều nhận được', () => {
    expect(BroadcastAudienceTypes).toEqual(['ALL', 'GROUP', 'AREA']);
  });
});

describe('broadcastAudienceGaps', () => {
  it('ALL không bao giờ có gap', () => {
    expect(broadcastAudienceGaps(AllUsersAudience)).toEqual([]);
  });

  it('GROUP thiếu groupId bị chặn', () => {
    expect(
      broadcastAudienceGaps({
        type: 'GROUP',
        groupId: null,
        centerLat: null,
        centerLng: null,
        radiusMeters: null,
      }),
    ).toContain('audience.groupId là bắt buộc khi gửi theo nhóm');
  });

  it('AREA thiếu toạ độ bị chặn', () => {
    const gaps = broadcastAudienceGaps({
      type: 'AREA',
      groupId: null,
      centerLat: null,
      centerLng: null,
      radiusMeters: 5_000,
    });
    expect(gaps.some((g) => g.includes('centerLat'))).toBe(true);
  });

  it('AREA bán kính 0 bị chặn — nó gửi cho gần như không ai', () => {
    for (const radius of [0, -1]) {
      const gaps = broadcastAudienceGaps({
        type: 'AREA',
        groupId: null,
        centerLat: 10.7724,
        centerLng: 106.698,
        radiusMeters: radius,
      });
      expect(gaps).toContain(
        'audience.radiusMeters phải lớn hơn 0 khi gửi theo vùng',
      );
    }
  });

  it('bộ hợp lệ thì không còn gap', () => {
    expect(
      broadcastAudienceGaps({
        type: 'AREA',
        groupId: null,
        centerLat: 10.7724,
        centerLng: 106.698,
        radiusMeters: 5_000,
      }),
    ).toEqual([]);
    expect(
      broadcastAudienceGaps({
        type: 'GROUP',
        groupId: GroupId,
        centerLat: null,
        centerLng: null,
        radiusMeters: null,
      }),
    ).toEqual([]);
  });
});

describe('describeBroadcastAudience', () => {
  it('đọc được bằng chữ cho cả ba chế độ', () => {
    expect(describeBroadcastAudience(AllUsersAudience)).toContain(
      'toàn bộ người dùng',
    );
    expect(
      describeBroadcastAudience({
        type: 'GROUP',
        groupId: GroupId,
        centerLat: null,
        centerLng: null,
        radiusMeters: null,
      }),
    ).toContain(GroupId);
    expect(
      describeBroadcastAudience({
        type: 'AREA',
        groupId: null,
        centerLat: 10.7724,
        centerLng: 106.698,
        radiusMeters: 5_000,
      }),
    ).toBe('người trong bán kính 5.0 km quanh (10.7724, 106.698)');
  });
});

describe('broadcastIdempotencyKey', () => {
  it('gắn id lượt gửi, KHÔNG gắn ngày', () => {
    // Hai lượt gửi khác nhau trong cùng ngày là bình thường (sáng nhắc Rằm, chiều nhắc
    // sự kiện); khoá theo ngày sẽ chặn lượt thứ hai.
    const a = broadcastIdempotencyKey('bc-1', 'u-1');
    const b = broadcastIdempotencyKey('bc-2', 'u-1');
    expect(a).not.toBe(b);
    expect(a).toBe('BROADCAST:bc-1:u-1');
  });

  it('chạy lại cùng lượt gửi ra cùng khoá', () => {
    expect(broadcastIdempotencyKey('bc-1', 'u-1')).toBe(
      broadcastIdempotencyKey('bc-1', 'u-1'),
    );
  });
});
