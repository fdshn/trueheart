import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import { CharityNotifier } from './charity.notifier';

function build(failing = false) {
  const dispatch = {
    handle: failing
      ? jest.fn(async () => {
          throw new Error('mất kết nối');
        })
      : jest.fn(async () => ({ created: true, pushedDevices: 0 })),
  };
  return { notifier: new CharityNotifier(dispatch as never), dispatch };
}

const delivery = {
  globalId: 'd-1',
  campaignId: 'camp-1',
  contributionId: 'c-1',
  contributorId: 'nguoi-tang',
  organizerId: 'nguoi-to-chuc',
  status: 'CANCELLED' as const,
  createdAt: new Date(),
  completedAt: null,
  cancelledAt: new Date(),
  cancelReason: 'Không sắp xếp được',
  items: [],
};

describe('CharityNotifier', () => {
  it('huỷ lượt giao báo BÊN KIA, không báo người vừa bấm huỷ', async () => {
    const { notifier, dispatch } = build();

    await notifier.deliveryCancelled({
      campaignTitle: 'Bếp cơm',
      delivery,
      cancelledBy: 'nguoi-tang',
    });
    await notifier.deliveryCancelled({
      campaignTitle: 'Bếp cơm',
      delivery,
      cancelledBy: 'nguoi-to-chuc',
    });

    expect(
      (dispatch.handle.mock.calls as unknown as [{ userId: string }][]).map(
        ([call]) => call.userId,
      ),
    ).toEqual(['nguoi-to-chuc', 'nguoi-tang']);
  });

  it('nhận MỘT PHẦN thì câu thông báo nói rõ là một phần', async () => {
    // Người nhận được một phần cần biết ngay — trước khi họ mang cả hai món tới.
    const { notifier, dispatch } = build();

    await notifier.contributionDecided({
      campaignTitle: 'Bếp cơm',
      contribution: {
        globalId: 'c-1',
        contributorId: 'nguoi-tang',
        status: 'PARTIALLY_ACCEPTED',
      },
    });

    const [command] = dispatch.handle.mock.calls[0] as unknown as [
      { body: string; type: string; idempotencyKey: string },
    ];
    expect(command.body).toMatch(/MỘT PHẦN/);
    expect(command.type).toBe(NotificationTypes.CHARITY_CONTRIBUTION_DECIDED);
    expect(command.idempotencyKey).toBe(
      `${NotificationTypes.CHARITY_CONTRIBUTION_DECIDED}:c-1`,
    );
  });

  it('bị từ chối vì ĐÓNG thì nói là do đóng, không đổ cho người tổ chức', async () => {
    const { notifier, dispatch } = build();

    await notifier.contributionDecided({
      campaignTitle: 'Bếp cơm',
      contribution: {
        globalId: 'c-1',
        contributorId: 'nguoi-tang',
        status: 'REJECTED',
      },
      byClosing: true,
    });

    const [command] = dispatch.handle.mock.calls[0] as unknown as [
      { body: string },
    ];
    expect(command.body).toMatch(/đã đóng/);
  });

  it('lỗi khi gửi KHÔNG ném ra — việc chính đã commit', async () => {
    const { notifier } = build(true);

    await expect(
      notifier.deliveryCompleted({ campaignTitle: 'Bếp cơm', delivery }),
    ).resolves.toBeUndefined();
  });

  it('hoạt động mất người tạo thì không có ai để báo, không phải lỗi', async () => {
    const { notifier, dispatch } = build();

    await notifier.contributionSubmitted({
      organizerId: null,
      campaignTitle: 'Bếp cơm',
      contribution: { globalId: 'c-1', items: [] } as never,
    });

    expect(dispatch.handle).not.toHaveBeenCalled();
  });
});
