import {
  NotificationGroups,
  NotificationTargetTypes,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { DispatchNotificationUseCase } from './dispatch-notification.use-case';

const UserId = '99999999-9999-9999-9999-999999999999';

function makeUseCase(
  options: {
    created?: boolean;
    muted?: NotificationGroups[] | Error;
    canSend?: boolean | Error;
    tokens?: string[];
    pushed?: number | Error;
    template?: { title: string; body: string } | null | Error;
  } = {},
) {
  const notifications = {
    create: jest.fn(async (row: { globalId: string }) =>
      options.created === false ? null : { ...row },
    ),
    listMutedGroups: jest.fn(async () => {
      if (options.muted instanceof Error) throw options.muted;
      return options.muted ?? [];
    }),
    findPushTokens: jest.fn(async () => options.tokens ?? ['token-1']),
    markPushed: jest.fn(async () => undefined),
  };
  const pushSender = {
    canSend: jest.fn(async () => {
      if (options.canSend instanceof Error) throw options.canSend;
      return options.canSend ?? true;
    }),
    send: jest.fn(async (tokens: string[]) => {
      if (options.pushed instanceof Error) throw options.pushed;
      return options.pushed ?? tokens.length;
    }),
  };
  const templates = {
    findEnabled: jest.fn(async () => {
      if (options.template instanceof Error) throw options.template;
      return options.template ?? null;
    }),
  };

  return {
    useCase: new DispatchNotificationUseCase(
      notifications as never,
      pushSender as never,
      templates as never,
    ),
    notifications,
    pushSender,
    templates,
  };
}

const command = {
  userId: UserId,
  type: NotificationTypes.GIFT_REQUEST_ACCEPTED,
  title: 'Yêu cầu của bạn đã được duyệt',
  body: 'Người tặng đã chọn bạn.',
  referenceType: 'GIFT_TRANSACTION',
  referenceId: 'deal-1',
  idempotencyKey: 'GIFT_REQUEST_ACCEPTED:deal-1',
};

describe('DispatchNotificationUseCase', () => {
  it('ghi bản ghi trong app đúng người nhận, loại và khoá chống trùng', async () => {
    const { useCase, notifications } = makeUseCase();

    await useCase.handle(command);

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: UserId,
        type: NotificationTypes.GIFT_REQUEST_ACCEPTED,
        title: command.title,
        body: command.body,
        referenceType: 'GIFT_TRANSACTION',
        referenceId: 'deal-1',
        idempotencyKey: 'GIFT_REQUEST_ACCEPTED:deal-1',
      }),
    );
  });

  it('thiếu tham chiếu và khoá thì ghi null, mỗi lần một id ngẫu nhiên', async () => {
    const { useCase, notifications } = makeUseCase();
    const bare = {
      userId: UserId,
      type: NotificationTypes.GIFT_REQUEST_ACCEPTED,
      title: 't',
      body: 'b',
    };

    await useCase.handle(bare);
    await useCase.handle(bare);

    const [first, second] = notifications.create.mock.calls.map(
      ([row]) => row as unknown as Record<string, unknown>,
    );
    expect(first).toMatchObject({
      referenceType: null,
      referenceId: null,
      idempotencyKey: null,
    });
    expect(first.globalId).not.toBe(second.globalId);
  });

  it('đẩy xuống mọi thiết bị của người nhận và đánh dấu đã đẩy', async () => {
    const { useCase, notifications, pushSender } = makeUseCase({
      tokens: ['token-1', 'token-2'],
    });

    const result = await useCase.handle(command);

    expect(result).toEqual({ created: true, pushedDevices: 2 });
    expect(notifications.findPushTokens).toHaveBeenCalledWith(UserId);
    expect(pushSender.send).toHaveBeenCalledWith(['token-1', 'token-2'], {
      title: command.title,
      body: command.body,
      type: NotificationTypes.GIFT_REQUEST_ACCEPTED,
      referenceType: 'GIFT_TRANSACTION',
      referenceId: 'deal-1',
    });
    const createdId = (
      notifications.create.mock.calls[0][0] as unknown as { globalId: string }
    ).globalId;
    expect(notifications.markPushed).toHaveBeenCalledWith([createdId]);
  });

  it('trùng khoá chống trùng thì không đẩy lần hai', async () => {
    const { useCase, notifications, pushSender } = makeUseCase({
      created: false,
    });

    const result = await useCase.handle(command);

    expect(result).toEqual({ created: false, pushedDevices: 0 });
    expect(notifications.listMutedGroups).not.toHaveBeenCalled();
    expect(pushSender.canSend).not.toHaveBeenCalled();
    expect(pushSender.send).not.toHaveBeenCalled();
  });

  it('người nhận tắt nhóm chứa loại này: vẫn ghi hộp thư nhưng không đẩy', async () => {
    const { useCase, notifications, pushSender } = makeUseCase({
      muted: [NotificationGroups.STATUS],
    });

    const result = await useCase.handle(command);

    expect(result).toEqual({ created: true, pushedDevices: 0 });
    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.listMutedGroups).toHaveBeenCalledWith(UserId);
    expect(pushSender.send).not.toHaveBeenCalled();
  });

  it('tắt nhóm KHÁC thì vẫn đẩy như thường', async () => {
    const { useCase, pushSender } = makeUseCase({
      muted: [NotificationGroups.CONTACT, NotificationGroups.REWARD],
    });

    const result = await useCase.handle(command);

    expect(result.pushedDevices).toBe(1);
    expect(pushSender.send).toHaveBeenCalledTimes(1);
  });

  it('đọc cài đặt hỏng thì coi như chưa tắt và vẫn đẩy', async () => {
    const { useCase, pushSender } = makeUseCase({
      muted: new Error('db down'),
    });

    const result = await useCase.handle(command);

    expect(result).toEqual({ created: true, pushedDevices: 1 });
    expect(pushSender.send).toHaveBeenCalledTimes(1);
  });

  it('kênh đẩy chưa cấu hình: không đọc token, vẫn trả về đã ghi', async () => {
    const { useCase, notifications, pushSender } = makeUseCase({
      canSend: false,
    });

    const result = await useCase.handle(command);

    expect(result).toEqual({ created: true, pushedDevices: 0 });
    expect(notifications.findPushTokens).not.toHaveBeenCalled();
    expect(pushSender.send).not.toHaveBeenCalled();
  });

  it('người nhận không có thiết bị nào thì không gọi kênh đẩy', async () => {
    const { useCase, pushSender } = makeUseCase({ tokens: [] });

    const result = await useCase.handle(command);

    expect(result).toEqual({ created: true, pushedDevices: 0 });
    expect(pushSender.send).not.toHaveBeenCalled();
  });

  it('kênh đẩy ném lỗi: không ném ra ngoài, bản ghi trong app vẫn còn', async () => {
    const { useCase, notifications } = makeUseCase({
      pushed: new Error('FCM 503'),
    });

    await expect(useCase.handle(command)).resolves.toEqual({
      created: true,
      pushedDevices: 0,
    });
    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.markPushed).not.toHaveBeenCalled();
  });

  it('kiểm kênh đẩy ném lỗi cũng không làm hỏng lời gọi', async () => {
    const { useCase } = makeUseCase({ canSend: new Error('boom') });

    await expect(useCase.handle(command)).resolves.toEqual({
      created: true,
      pushedDevices: 0,
    });
  });

  it('không thiết bị nào nhận được thì không đánh dấu đã đẩy', async () => {
    const { useCase, notifications } = makeUseCase({ pushed: 0 });

    const result = await useCase.handle(command);

    expect(result.pushedDevices).toBe(0);
    expect(notifications.markPushed).not.toHaveBeenCalled();
  });

  it('có mẫu Admin đang bật thì ghi chữ theo mẫu, thay đủ chỗ trống', async () => {
    const { useCase, notifications, templates } = makeUseCase({
      template: { title: 'Duyệt ({trigger})', body: 'Bạn được chọn {missing}' },
    });

    await useCase.handle({ ...command, variables: { trigger: 'MANUAL' } });

    expect(templates.findEnabled).toHaveBeenCalledWith(
      NotificationTypes.GIFT_REQUEST_ACCEPTED,
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Duyệt (MANUAL)',
        body: 'Bạn được chọn {missing}',
      }),
    );
  });

  it('đọc mẫu hỏng thì dùng chữ nơi gọi dựng, không nuốt thông báo', async () => {
    const { useCase, notifications } = makeUseCase({
      template: new Error('db down'),
    });

    const result = await useCase.handle(command);

    expect(result.created).toBe(true);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: command.title, body: command.body }),
    );
  });

  // Trước 16/10 push() gửi chữ của nơi gọi: bật mẫu thì hộp thư hiện chữ mới
  // nhưng điện thoại vẫn rung với chữ hardcode cũ.
  it('đẩy cùng chữ đã render từ mẫu như bản ghi trong hộp thư', async () => {
    const { useCase, pushSender } = makeUseCase({
      template: { title: 'Tiêu đề mẫu', body: 'Nội dung mẫu' },
    });

    await useCase.handle(command);

    expect(pushSender.send).toHaveBeenCalledWith(
      ['token-1'],
      expect.objectContaining({ title: 'Tiêu đề mẫu', body: 'Nội dung mẫu' }),
    );
  });
});

describe('DispatchNotificationUseCase — đích điều hướng', () => {
  const written = (
    notifications: ReturnType<typeof makeUseCase>['notifications'],
  ) =>
    notifications.create.mock.calls[0]![0] as unknown as {
      targetType: string | null;
      targetId: string | null;
    };

  it('không truyền đích: reference là một màn (lượt trao) thì đích chính là nó', async () => {
    const { useCase, notifications } = makeUseCase();

    await useCase.handle(command);

    expect(written(notifications)).toMatchObject({
      targetType: NotificationTargetTypes.GIFT_TRANSACTION,
      targetId: 'deal-1',
    });
  });

  it('reference là đối tượng con (yêu cầu xin đồ) thì không tự đoán đích', async () => {
    const { useCase, notifications } = makeUseCase();

    await useCase.handle({
      ...command,
      type: NotificationTypes.GIFT_REQUEST_CREATED,
      referenceType: 'GIFT_REQUEST',
      referenceId: 'request-1',
    });

    expect(written(notifications)).toMatchObject({
      targetType: null,
      targetId: null,
    });
  });

  it('đích truyền rõ được ghi nguyên', async () => {
    const { useCase, notifications } = makeUseCase();

    await useCase.handle({
      ...command,
      type: NotificationTypes.GIFT_REQUEST_CREATED,
      referenceType: 'GIFT_REQUEST',
      referenceId: 'request-1',
      target: { type: NotificationTargetTypes.POST, id: 'post-1' },
    });

    expect(written(notifications)).toMatchObject({
      targetType: NotificationTargetTypes.POST,
      targetId: 'post-1',
    });
  });

  it('đích không khai cho loại này bị bỏ, thông báo vẫn ghi', async () => {
    // Đích sai là một nút bấm mở nhầm màn. Bỏ đích (mobile mở hộp thư) còn hơn, và
    // KHÔNG được làm mất thông báo — người dùng vẫn đang chờ nó.
    const { useCase, notifications } = makeUseCase();

    const result = await useCase.handle({
      ...command,
      target: { type: NotificationTargetTypes.CHARITY_CAMPAIGN, id: 'c-1' },
    });

    expect(result.created).toBe(true);
    expect(written(notifications)).toMatchObject({
      targetType: null,
      targetId: null,
    });
  });

  it('target: null là chủ ý không có màn đích, kể cả khi reference là một màn', async () => {
    const { useCase, notifications } = makeUseCase();

    await useCase.handle({ ...command, target: null });

    expect(written(notifications)).toMatchObject({
      targetType: null,
      targetId: null,
    });
  });
});
