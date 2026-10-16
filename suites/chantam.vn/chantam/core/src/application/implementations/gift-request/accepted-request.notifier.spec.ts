import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { AcceptedRequestNotifier } from './accepted-request.notifier';

function makeNotifier(handle = jest.fn(async () => ({ created: true }))) {
  return {
    notifier: new AcceptedRequestNotifier({ handle } as never),
    handle,
  };
}

const base = {
  receiverId: 'receiver-1',
  giverId: 'giver-1',
  postId: 'post-1',
  transactionId: 'deal-1',
};

describe('AcceptedRequestNotifier', () => {
  it('chủ bài tự duyệt: chỉ báo người nhận, không báo lại chủ bài', async () => {
    const { notifier, handle } = makeNotifier();

    await notifier.announce({ ...base, trigger: 'MANUAL' });

    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith({
      userId: 'receiver-1',
      type: NotificationTypes.GIFT_REQUEST_ACCEPTED,
      title: 'Yêu cầu của bạn đã được duyệt',
      body: 'Người tặng đã chọn bạn. Cuộc trò chuyện với người tặng đã mở.',
      referenceType: 'GIFT_TRANSACTION',
      referenceId: 'deal-1',
      idempotencyKey: 'GIFT_REQUEST_ACCEPTED:deal-1',
      variables: { trigger: 'MANUAL' },
    });
  });

  it.each(['AUTOMATIC', 'REDEEMED'] as const)(
    'lượt chốt %s không do chủ bài bấm: báo cả người nhận lẫn chủ bài',
    async (trigger) => {
      const { notifier, handle } = makeNotifier();

      await notifier.announce({ ...base, trigger });

      expect(handle).toHaveBeenCalledTimes(2);
      expect(handle).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          userId: 'receiver-1',
          type: NotificationTypes.GIFT_REQUEST_ACCEPTED,
        }),
      );
      expect(handle).toHaveBeenNthCalledWith(2, {
        userId: 'giver-1',
        type: NotificationTypes.GIFT_POST_RECEIVER_SELECTED,
        title: 'Bài của bạn đã có người nhận',
        body: expect.stringMatching(/\S/),
        referenceType: 'GIFT_TRANSACTION',
        referenceId: 'deal-1',
        idempotencyKey: 'GIFT_POST_RECEIVER_SELECTED:deal-1',
        variables: { trigger, postId: 'post-1' },
      });
    },
  );

  it('đổi điểm không được nói là "người tặng đã chọn bạn"', async () => {
    const { notifier, handle } = makeNotifier();

    await notifier.announce({ ...base, trigger: 'REDEEMED' });

    const receiverBody = (
      handle.mock.calls[0] as unknown as [{ body: string }]
    )[0].body;
    expect(receiverBody).toContain('dùng điểm');
    expect(receiverBody).not.toContain('Người tặng đã chọn bạn');
  });

  it('tự chọn khi hết giờ nói rõ là hệ thống chọn', async () => {
    const { notifier, handle } = makeNotifier();

    await notifier.announce({ ...base, trigger: 'AUTOMATIC' });

    const bodies = (handle.mock.calls as unknown as [{ body: string }][]).map(
      ([command]) => command.body,
    );
    expect(bodies.every((body) => body.includes('hệ thống đã chọn'))).toBe(
      true,
    );
  });

  it('báo người nhận hỏng thì không ném và vẫn báo chủ bài', async () => {
    const handle = jest
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue({ created: true });
    const { notifier } = makeNotifier(handle);

    await expect(
      notifier.announce({ ...base, trigger: 'AUTOMATIC' }),
    ).resolves.toBeUndefined();
    expect(handle).toHaveBeenCalledTimes(2);
  });

  it('báo chủ bài hỏng cũng không ném ra nơi gọi', async () => {
    const handle = jest.fn(async () => {
      throw new Error('db down');
    });
    const { notifier } = makeNotifier(handle as never);

    await expect(
      notifier.announce({ ...base, trigger: 'REDEEMED' }),
    ).resolves.toBeUndefined();
  });
});
