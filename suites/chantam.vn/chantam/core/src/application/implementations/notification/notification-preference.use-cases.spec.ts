import {
  NotificationGroupOf,
  NotificationGroups,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { NotificationPreferenceUseCases } from './notification-preference.use-cases';

const UserId = '99999999-9999-9999-9999-999999999999';

function makeUseCases(muted: NotificationGroups[] = []) {
  const notifications = {
    listMutedGroups: jest.fn(async () => muted),
    setGroupMuted: jest.fn(async () => undefined),
  };
  return {
    useCases: new NotificationPreferenceUseCases(notifications as never),
    notifications,
  };
}

describe('NotificationPreferenceUseCases', () => {
  it('chưa đụng cài đặt thì trả đủ mọi nhóm, tất cả đang bật', async () => {
    const { useCases, notifications } = makeUseCases();

    const result = await useCases.list(UserId);

    expect(notifications.listMutedGroups).toHaveBeenCalledWith(UserId);
    expect(result.map((item) => item.group)).toEqual(
      Object.values(NotificationGroups),
    );
    expect(result.every((item) => !item.muted)).toBe(true);
  });

  it('chỉ đánh dấu tắt đúng những nhóm người dùng đã tắt', async () => {
    const { useCases } = makeUseCases([NotificationGroups.CONTACT]);

    const result = await useCases.list(UserId);

    const muted = result.filter((item) => item.muted).map((item) => item.group);
    expect(muted).toEqual([NotificationGroups.CONTACT]);
  });

  it('mỗi nhóm liệt kê đúng các loại thuộc nó, không loại nào lạc hay sót', async () => {
    const { useCases } = makeUseCases();

    const result = await useCases.list(UserId);

    const status = result.find(
      (item) => item.group === NotificationGroups.STATUS,
    );
    expect(status?.types).toContain(NotificationTypes.GIFT_REQUEST_ACCEPTED);
    expect(status?.types).not.toContain(NotificationTypes.NEW_CHAT_MESSAGE);
    for (const item of result)
      for (const type of item.types)
        expect(NotificationGroupOf[type]).toBe(item.group);
    expect(result.flatMap((item) => item.types).sort()).toEqual(
      Object.keys(NotificationGroupOf).sort(),
    );
  });

  it('đặt một nhóm thì chỉ ghi đúng nhóm đó rồi trả lại danh sách mới', async () => {
    const { useCases, notifications } = makeUseCases([
      NotificationGroups.STATUS,
    ]);

    const result = await useCases.set({
      userId: UserId,
      group: NotificationGroups.STATUS,
      muted: true,
    });

    expect(notifications.setGroupMuted).toHaveBeenCalledTimes(1);
    expect(notifications.setGroupMuted).toHaveBeenCalledWith({
      userId: UserId,
      group: NotificationGroups.STATUS,
      muted: true,
    });
    expect(
      notifications.setGroupMuted.mock.invocationCallOrder[0],
    ).toBeLessThan(notifications.listMutedGroups.mock.invocationCallOrder[0]);
    expect(
      result.find((item) => item.group === NotificationGroups.STATUS)?.muted,
    ).toBe(true);
  });
});
