import {
  NotificationTargetTypes,
  NotificationTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { RequestLifecycleNotifier } from './request-lifecycle.notifier';

function makeNotifier(handle = jest.fn(async () => ({ created: true }))) {
  return {
    notifier: new RequestLifecycleNotifier({ handle } as never),
    handle,
  };
}

describe('RequestLifecycleNotifier', () => {
  describe('announceCreated', () => {
    const params = {
      ownerId: 'owner-1',
      requesterId: 'requester-1',
      postId: 'post-1',
      postTitle: 'Áo ấm',
      requestId: 'request-1',
    };

    it('báo CHỦ BÀI có người vừa xin, khoá theo yêu cầu', async () => {
      const { notifier, handle } = makeNotifier();

      await notifier.announceCreated(params);

      expect(handle).toHaveBeenCalledWith({
        userId: 'owner-1',
        type: NotificationTypes.GIFT_REQUEST_CREATED,
        title: 'Có người muốn nhận đồ của bạn',
        body: 'Một người vừa gửi yêu cầu xin nhận cho bài "Áo ấm".',
        referenceType: 'GIFT_REQUEST',
        referenceId: 'request-1',
        target: { type: NotificationTargetTypes.POST, id: 'post-1' },
        idempotencyKey: 'GIFT_REQUEST_CREATED:request-1',
      });
    });

    it('không tự báo chính mình khi người xin là chủ bài', async () => {
      const { notifier, handle } = makeNotifier();

      await notifier.announceCreated({ ...params, requesterId: 'owner-1' });

      expect(handle).not.toHaveBeenCalled();
    });
  });

  it('announceRejected báo NGƯỜI XIN bằng loại bị từ chối', async () => {
    const { notifier, handle } = makeNotifier();

    await notifier.announceRejected({
      requesterId: 'requester-1',
      postId: 'post-1',
      postTitle: 'Áo ấm',
      requestId: 'request-1',
    });

    expect(handle).toHaveBeenCalledWith({
      userId: 'requester-1',
      type: NotificationTypes.GIFT_REQUEST_REJECTED,
      title: 'Yêu cầu của bạn chưa được chọn',
      body: 'Người tặng đã không chọn yêu cầu của bạn cho bài "Áo ấm".',
      referenceType: 'GIFT_REQUEST',
      referenceId: 'request-1',
      target: { type: NotificationTargetTypes.POST, id: 'post-1' },
      idempotencyKey: 'GIFT_REQUEST_REJECTED:request-1',
    });
  });

  it('announceClosed dùng loại ĐÓNG chứ không phải từ chối, kèm lý do', async () => {
    const { notifier, handle } = makeNotifier();

    await notifier.announceClosed({
      requesterId: 'requester-1',
      postId: 'post-1',
      postTitle: 'Áo ấm',
      requestId: 'request-1',
      reason: 'Bài đã hết hạn',
    });

    expect(handle).toHaveBeenCalledWith({
      userId: 'requester-1',
      type: NotificationTypes.GIFT_REQUEST_CLOSED,
      title: 'Yêu cầu của bạn đã được đóng',
      body: 'Bài đã hết hạn nên yêu cầu xin nhận của bạn cho bài "Áo ấm" được đóng lại.',
      referenceType: 'GIFT_REQUEST',
      referenceId: 'request-1',
      target: { type: NotificationTargetTypes.POST, id: 'post-1' },
      idempotencyKey: 'GIFT_REQUEST_CLOSED:request-1',
    });
  });

  it('gửi hỏng thì không ném ra nơi gọi, ở cả ba đường', async () => {
    const handle = jest.fn(async () => {
      throw new Error('db down');
    });
    const { notifier } = makeNotifier(handle as never);

    await expect(
      notifier.announceCreated({
        ownerId: 'owner-1',
        requesterId: 'requester-1',
        postId: 'post-1',
        postTitle: 'Áo ấm',
        requestId: 'request-1',
      }),
    ).resolves.toBeUndefined();
    await expect(
      notifier.announceRejected({
        requesterId: 'requester-1',
        postId: 'post-1',
        postTitle: 'Áo ấm',
        requestId: 'request-1',
      }),
    ).resolves.toBeUndefined();
    await expect(
      notifier.announceClosed({
        requesterId: 'requester-1',
        postId: 'post-1',
        postTitle: 'Áo ấm',
        requestId: 'request-1',
        reason: 'Bài đã gỡ',
      }),
    ).resolves.toBeUndefined();
    expect(handle).toHaveBeenCalledTimes(3);
  });
});

describe('RequestLifecycleNotifier.announceRebalanced (12/11)', () => {
  const base = {
    requestId: 'req-b',
    requesterId: 'user-b',
    postId: 'post-1',
    postTitle: 'Gạo',
    remainingQuantity: 2,
    requestedQuantity: 8,
  };

  it('PENDING → STANDBY thiếu hàng: báo số còn lại, số đã xin và việc làm được', async () => {
    const { notifier, handle } = makeNotifier();
    await notifier.announceRebalanced([
      {
        ...base,
        fromStatus: 'PENDING',
        toStatus: 'STANDBY',
        statusReason: 'INSUFFICIENT_QUANTITY',
      },
    ]);
    expect(handle).toHaveBeenCalledTimes(1);
    const sent = (handle.mock.calls[0] as unknown[])[0] as {
      type: string;
      body: string;
      idempotencyKey: string;
    };
    expect(sent.type).toBe(NotificationTypes.GIFT_REQUEST_STANDBY);
    expect(sent.body).toContain('chỉ còn 2 món');
    expect(sent.body).toContain('8 món');
    expect(sent.idempotencyKey).toBe(
      'GIFT_REQUEST_STANDBY:req-b:STANDBY:INSUFFICIENT_QUANTITY:2',
    );
  });

  it('PENDING → STANDBY hết hàng: báo đang giữ trong hàng chờ', async () => {
    const { notifier, handle } = makeNotifier();
    await notifier.announceRebalanced([
      {
        ...base,
        remainingQuantity: 0,
        fromStatus: 'PENDING',
        toStatus: 'STANDBY',
        statusReason: 'OUT_OF_STOCK',
      },
    ]);
    const sent = (handle.mock.calls[0] as unknown[])[0] as { title: string };
    expect(sent.title).toBe('Món đồ tạm hết');
  });

  it('STANDBY → PENDING: báo đã trở lại hàng chờ xét', async () => {
    const { notifier, handle } = makeNotifier();
    await notifier.announceRebalanced([
      {
        ...base,
        remainingQuantity: 10,
        fromStatus: 'STANDBY',
        toStatus: 'PENDING',
        statusReason: null,
      },
    ]);
    const sent = (handle.mock.calls[0] as unknown[])[0] as { type: string };
    expect(sent.type).toBe(NotificationTypes.GIFT_REQUEST_REOPENED);
  });

  it('STANDBY đổi lý do sang thiếu hàng thì báo (giảm số giờ có tác dụng); sang hết hàng thì không', async () => {
    const { notifier, handle } = makeNotifier();
    await notifier.announceRebalanced([
      {
        ...base,
        fromStatus: 'STANDBY',
        toStatus: 'STANDBY',
        statusReason: 'INSUFFICIENT_QUANTITY',
      },
      {
        ...base,
        requestId: 'req-c',
        remainingQuantity: 0,
        fromStatus: 'STANDBY',
        toStatus: 'STANDBY',
        statusReason: 'OUT_OF_STOCK',
      },
    ]);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('bỏ qua người trong excludeUserIds (đã nhận "đang được xét tiếp")', async () => {
    const { notifier, handle } = makeNotifier();
    await notifier.announceRebalanced(
      [
        {
          ...base,
          fromStatus: 'STANDBY',
          toStatus: 'PENDING',
          statusReason: null,
        },
      ],
      { excludeUserIds: ['user-b'] },
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('nudgeStandby: khoá theo request + số còn lại — mỗi mốc nhắc một lần', async () => {
    const { notifier, handle } = makeNotifier();
    await notifier.nudgeStandby(base);
    const sent = (handle.mock.calls[0] as unknown[])[0] as {
      idempotencyKey: string;
      body: string;
    };
    expect(sent.idempotencyKey).toBe('GIFT_REQUEST_STANDBY_NUDGE:req-b:2');
    expect(sent.body).toContain('Giảm số lượng xuống 2');
  });
});
