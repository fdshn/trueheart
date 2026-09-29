import { CandidateSelectionCriteria } from '@chantam.vn/chantam.core-lib/consts';
import { AutoSelectDueRecipientsUseCase } from './auto-select-due-recipients.use-case';

const PostId = '88888888-8888-4888-8888-888888880001';
const GiverId = '99999999-9999-4999-8999-999999990001';

function candidate(
  overrides: Partial<{
    requestGlobalId: string;
    requesterId: string;
    queueJoinedAt: Date;
    requestId: number;
    rank: string;
    distanceMeters: number | null;
    receivedCount: number;
    cancellationCount: number;
  }> = {},
) {
  return {
    requestGlobalId: 'req-1',
    requesterId: 'user-1',
    queueJoinedAt: new Date('2026-09-01T00:00:00Z'),
    requestId: 1,
    rank: 'MEMBER',
    distanceMeters: 1000,
    receivedCount: 0,
    cancellationCount: 0,
    ...overrides,
  };
}

function makeUseCase(
  options: {
    due?: { postId: string; giverId: string }[];
    candidates?: ReturnType<typeof candidate>[];
    order?: unknown;
    acceptError?: unknown;
  } = {},
) {
  const requests = {
    findPostsDueForSelection: jest
      .fn()
      .mockResolvedValue(options.due ?? [{ postId: PostId, giverId: GiverId }]),
    listCandidateMetrics: jest
      .fn()
      .mockResolvedValue(options.candidates ?? [candidate()]),
    acceptRequest: options.acceptError
      ? jest.fn().mockRejectedValue(options.acceptError)
      : jest.fn().mockResolvedValue({ transactionId: 'tx-1' }),
  };
  const adminConfig = {
    getConfigValue: jest.fn().mockResolvedValue(options.order ?? null),
  };

  const notifier = { announce: jest.fn().mockResolvedValue(undefined) };

  return {
    useCase: new AutoSelectDueRecipientsUseCase(
      requests as never,
      adminConfig as never,
      notifier as never,
    ),
    requests,
    adminConfig,
    notifier,
  };
}

describe('AutoSelectDueRecipientsUseCase', () => {
  it('không có bài nào tới hạn thì không đọc gì thêm', async () => {
    const { useCase, requests, adminConfig } = makeUseCase({ due: [] });

    const result = await useCase.handle({});

    expect(result).toEqual({ due: 0, selected: [], failed: [] });
    expect(adminConfig.getConfigValue).not.toHaveBeenCalled();
    expect(requests.listCandidateMetrics).not.toHaveBeenCalled();
  });

  it('đọc cấu hình thứ tự MỘT lần cho cả vòng', async () => {
    // Đọc lại mỗi bài sẽ cho hai bài cùng lượt chạy xếp theo hai thứ tự khác
    // nhau nếu Admin đổi cấu hình giữa chừng.
    const { useCase, adminConfig } = makeUseCase({
      due: [
        { postId: 'p1', giverId: GiverId },
        { postId: 'p2', giverId: GiverId },
      ],
    });

    await useCase.handle({});

    expect(adminConfig.getConfigValue).toHaveBeenCalledTimes(1);
  });

  it('duyệt đúng yêu cầu của người thắng, không phải id người dùng', async () => {
    // `acceptRequest` nhận global_id của YÊU CẦU. Truyền nhầm id người là duyệt
    // một yêu cầu không tồn tại.
    const { useCase, requests } = makeUseCase({
      candidates: [candidate({ requestGlobalId: 'req-9', requesterId: 'u-9' })],
    });

    await useCase.handle({});

    expect(requests.acceptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-9',
        postId: PostId,
        giverId: GiverId,
      }),
    );
  });

  it('mặc định chọn người xin TRƯỚC khi Admin chưa cấu hình', async () => {
    // Tiêu chí duy nhất người dùng tự kiểm chứng được — họ biết mình bấm lúc nào.
    const { useCase, requests } = makeUseCase({
      candidates: [
        candidate({
          requestGlobalId: 'sau',
          requestId: 2,
          queueJoinedAt: new Date('2026-09-05T00:00:00Z'),
        }),
        candidate({
          requestGlobalId: 'truoc',
          requestId: 1,
          queueJoinedAt: new Date('2026-09-01T00:00:00Z'),
        }),
      ],
    });

    await useCase.handle({});

    expect(requests.acceptRequest.mock.calls[0][0].requestId).toBe('truoc');
  });

  it('theo thứ tự Admin cấu hình khi có', async () => {
    const { useCase, requests } = makeUseCase({
      order: [CandidateSelectionCriteria.HIGHEST_RANK],
      candidates: [
        candidate({
          requestGlobalId: 'xin-truoc-hang-thap',
          requestId: 1,
          rank: 'MEMBER',
          queueJoinedAt: new Date('2026-09-01T00:00:00Z'),
        }),
        candidate({
          requestGlobalId: 'xin-sau-hang-cao',
          requestId: 2,
          rank: 'DIAMOND',
          queueJoinedAt: new Date('2026-09-05T00:00:00Z'),
        }),
      ],
    });

    await useCase.handle({});

    expect(requests.acceptRequest.mock.calls[0][0].requestId).toBe(
      'xin-sau-hang-cao',
    );
  });

  it('ứng viên rút hết giữa chừng thì bỏ qua, không coi là lỗi', async () => {
    const { useCase, requests } = makeUseCase({ candidates: [] });

    const result = await useCase.handle({});

    expect(requests.acceptRequest).not.toHaveBeenCalled();
    expect(result).toMatchObject({ due: 1, selected: [], failed: [] });
  });

  it('dry-run nêu người sẽ được chọn nhưng KHÔNG duyệt', async () => {
    const { useCase, requests } = makeUseCase();

    const result = await useCase.handle({ dryRun: true });

    expect(requests.acceptRequest).not.toHaveBeenCalled();
    expect(result.selected[0]).toMatchObject({
      requesterId: 'user-1',
      transactionId: null,
      candidates: 1,
    });
  });

  it('một bài hỏng không làm dừng cả vòng', async () => {
    // Những bài còn lại cũng đang để người xin chờ một đồng hồ đã reo.
    const { useCase } = makeUseCase({
      due: [
        { postId: 'p1', giverId: GiverId },
        { postId: 'p2', giverId: GiverId },
      ],
      acceptError: new Error('hết hàng'),
    });

    const result = await useCase.handle({});

    expect(result.due).toBe(2);
    expect(result.failed).toHaveLength(2);
    expect(result.failed[0].reason).toContain('hết hàng');
  });

  it('ghi lại số ứng viên đã cân nhắc', async () => {
    // Log phải nói được "chọn 1 trong 7" — đây là lúc hệ thống quyết hộ người
    // dùng ai được nhận món đồ.
    const { useCase } = makeUseCase({
      candidates: [
        candidate({ requestGlobalId: 'a', requestId: 1 }),
        candidate({ requestGlobalId: 'b', requestId: 2 }),
        candidate({ requestGlobalId: 'c', requestId: 3 }),
      ],
    });

    const result = await useCase.handle({});

    expect(result.selected[0].candidates).toBe(3);
  });

  it('báo cho người được chọn, và nói rõ là hệ thống chọn', async () => {
    // Người dùng không bấm gì cả — hệ thống quyết hộ họ. Không báo thì họ chỉ
    // biết khi tình cờ mở app, trong khi người tặng đang chờ trả lời.
    const { useCase, notifier } = makeUseCase();

    await useCase.handle({});

    expect(notifier.announce).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: 'user-1',
        transactionId: 'tx-1',
        // `AUTOMATIC`, không phải một cờ boolean: có BA đường chốt người nhận, và
        // một cờ hai giá trị từng khiến người dùng điểm đổi nhận được câu "người
        // tặng đã chọn bạn" — trong khi người tặng không chọn ai cả.
        trigger: 'AUTOMATIC',
        // Chủ bài cũng được báo ở đường này: họ không bấm gì mà bài đột nhiên có
        // người nhận.
        giverId: expect.any(String),
      }),
    );
  });

  it('dry-run KHÔNG báo cho ai', async () => {
    const { useCase, notifier } = makeUseCase();

    await useCase.handle({ dryRun: true });

    expect(notifier.announce).not.toHaveBeenCalled();
  });
});
