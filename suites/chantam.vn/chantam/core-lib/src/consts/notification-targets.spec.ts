import {
  isValidNotificationTarget,
  NotificationTargetsByType,
  NotificationTargetTypes,
  SingletonNotificationTargets,
} from './notification-targets';
import { NotificationTypes } from './notification-types';

describe('NotificationTargetsByType', () => {
  it('khai đủ mọi loại thông báo — không loại nào để mobile tự đoán', () => {
    expect(Object.keys(NotificationTargetsByType).sort()).toEqual(
      Object.values(NotificationTypes).sort(),
    );
  });

  it('chỉ dùng đích có thật, không lặp đích trong một loại', () => {
    const known = new Set(Object.values(NotificationTargetTypes));
    for (const targets of Object.values(NotificationTargetsByType)) {
      expect(targets.every((target) => known.has(target))).toBe(true);
      expect(new Set(targets).size).toBe(targets.length);
    }
  });

  it('yêu cầu xin đồ và lượt đóng góp mở màn CHA, không phải chính nó', () => {
    expect(
      NotificationTargetsByType[NotificationTypes.GIFT_REQUEST_CREATED],
    ).toEqual([NotificationTargetTypes.POST]);
    expect(
      NotificationTargetsByType[
        NotificationTypes.CHARITY_CONTRIBUTION_SUBMITTED
      ],
    ).toEqual([NotificationTargetTypes.CHARITY_CAMPAIGN]);
  });

  it('thông báo không có màn đích khai mảng rỗng', () => {
    expect(
      NotificationTargetsByType[NotificationTypes.SYSTEM_BROADCAST],
    ).toEqual([]);
    expect(
      NotificationTargetsByType[NotificationTypes.LUNAR_OBSERVANCE],
    ).toEqual([]);
  });
});

describe('isValidNotificationTarget', () => {
  const PostId = '30000000-0000-4000-8000-000000000001';

  it('nhận đích nằm trong danh sách, có id', () => {
    expect(
      isValidNotificationTarget(NotificationTypes.GIFT_REQUEST_CREATED, {
        type: NotificationTargetTypes.POST,
        id: PostId,
      }),
    ).toBe(true);
  });

  it('từ chối đích không khai cho loại đó', () => {
    expect(
      isValidNotificationTarget(NotificationTypes.GIFT_REQUEST_CREATED, {
        type: NotificationTargetTypes.GIFT_TRANSACTION,
        id: PostId,
      }),
    ).toBe(false);
  });

  it('đích cần id thì id rỗng là sai', () => {
    expect(
      isValidNotificationTarget(NotificationTypes.POST_EXPIRED, {
        type: NotificationTargetTypes.POST,
        id: null,
      }),
    ).toBe(false);
  });

  it('màn "của tôi" thì id phải null', () => {
    expect(SingletonNotificationTargets.has(NotificationTargetTypes.RANK)).toBe(
      true,
    );
    expect(
      isValidNotificationTarget(NotificationTypes.RANK_PROMOTED, {
        type: NotificationTargetTypes.RANK,
        id: null,
      }),
    ).toBe(true);
    expect(
      isValidNotificationTarget(NotificationTypes.RANK_PROMOTED, {
        type: NotificationTargetTypes.RANK,
        id: PostId,
      }),
    ).toBe(false);
  });
});

describe('huy hiệu bảng thành tích', () => {
  it('mở bảng thành tích của tôi — màn "của tôi", không id', () => {
    expect(
      isValidNotificationTarget(NotificationTypes.LEADERBOARD_BADGE_AWARDED, {
        type: NotificationTargetTypes.LEADERBOARD,
        id: null,
      }),
    ).toBe(true);
    expect(
      isValidNotificationTarget(NotificationTypes.LEADERBOARD_BADGE_AWARDED, {
        type: NotificationTargetTypes.LEADERBOARD,
        id: 'x',
      }),
    ).toBe(false);
  });
});
