import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
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
      idempotencyKey: 'GIFT_REQUEST_REJECTED:request-1',
    });
  });

  it('announceClosed dùng loại ĐÓNG chứ không phải từ chối, kèm lý do', async () => {
    const { notifier, handle } = makeNotifier();

    await notifier.announceClosed({
      requesterId: 'requester-1',
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
        postTitle: 'Áo ấm',
        requestId: 'request-1',
      }),
    ).resolves.toBeUndefined();
    await expect(
      notifier.announceClosed({
        requesterId: 'requester-1',
        postTitle: 'Áo ấm',
        requestId: 'request-1',
        reason: 'Bài đã gỡ',
      }),
    ).resolves.toBeUndefined();
    expect(handle).toHaveBeenCalledTimes(3);
  });
});
