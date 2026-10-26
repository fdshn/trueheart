import { GiftRequestNotFoundException } from '@/domain/exceptions';
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
    // Mock trả ĐỦ hình: `acceptRequest` phân giải vai và trả chúng ra, và use
    // case đọc chúng để gửi thông báo. Mock chỉ trả `transactionId` sẽ cho thông
    // báo đi với `giverId: undefined` mà không phép kiểm nào thấy — đúng loại lỗ
    // mà lượt sửa đảo vai này đang bịt.
    acceptRequest: options.acceptError
      ? jest.fn().mockRejectedValue(options.acceptError)
      : jest.fn().mockResolvedValue({
          transactionId: 'tx-1',
          giverId: GiverId,
          receiverId: 'user-1',
        }),
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
  it('lưu lý do chọn TRONG lượt duyệt: tiêu chí quyết định, người về nhì, số ứng viên (PR #46 §9)', async () => {
    const { useCase, requests } = makeUseCase({
      order: [CandidateSelectionCriteria.NEAREST],
      candidates: [
        candidate({
          requestGlobalId: 'req-far',
          requesterId: 'far',
          distanceMeters: 9_000,
          requestId: 1,
        }),
        candidate({
          requestGlobalId: 'req-near',
          requesterId: 'near',
          distanceMeters: 100,
          requestId: 2,
        }),
      ],
    });

    const result = await useCase.handle({});

    const [[accepted]] = requests.acceptRequest.mock.calls;
    expect(accepted.requestId).toBe('req-near');
    expect(accepted.selectionAudit).toMatchObject({
      decidingCriterion: CandidateSelectionCriteria.NEAREST,
      candidateCount: 2,
      winner: { requesterId: 'near' },
      runnerUp: { requesterId: 'far' },
    });
    expect(accepted.selectionAudit.order[0]).toBe(
      CandidateSelectionCriteria.NEAREST,
    );
    expect(result.selected[0].reason).toBe(CandidateSelectionCriteria.NEAREST);
  });

  it('lượt chạy song song đã chốt yêu cầu này trước: bỏ qua, không phải lỗi, không báo trùng', async () => {
    const { useCase, notifier } = makeUseCase({
      acceptError: new GiftRequestNotFoundException('req-1'),
    });

    const result = await useCase.handle({});

    expect(result.failed).toEqual([]);
    expect(result.selected).toEqual([]);
    expect(notifier.announce).not.toHaveBeenCalled();
  });

  it('không có bài nào tới hạn thì không đọc gì thêm', async () => {
    const { useCase, requests, adminConfig } = makeUseCase({ due: [] });

    const result = await useCase.handle({});

    expect(result).toEqual({
      due: 0,
      selected: [],
      failed: [],
      skippedByPolicy: false,
    });
    // Hai khoá — `allocation.policy` (công tắc, L23) và
    // `classified.legacy_transactions_enabled` (Rao vặt có vào vòng quét không, PR #46 §8).
    // Khoá thứ tự ưu tiên thì chưa, vì không có bài nào để xếp.
    expect(adminConfig.getConfigValue).toHaveBeenCalledTimes(2);
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

    // Ba lượt đọc: `allocation.policy` (công tắc), `classified.legacy_transactions_enabled`
    // (Rao vặt) và `selection.candidate_priority` (thứ tự ưu tiên). Cái cuối là cái phải đọc
    // MỘT lần cho cả vòng.
    expect(adminConfig.getConfigValue).toHaveBeenCalledTimes(3);
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
        actorUserId: GiverId,
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
        // Vai lấy từ KẾT QUẢ `acceptRequest`, không đoán từ truy vấn: với bài
        // Muốn Nhận `post.author_id` là người NHẬN.
        giverId: GiverId,
      }),
    );
  });

  it('dry-run KHÔNG báo cho ai', async () => {
    const { useCase, notifier } = makeUseCase();

    await useCase.handle({ dryRun: true });

    expect(notifier.announce).not.toHaveBeenCalled();
  });

  describe('công tắc autoCreateTransaction (mục mở L23)', () => {
    it('mặc định BẬT — chưa ai publish chính sách thì job vẫn chạy', async () => {
      // Tắt sẵn là biến `selection_deadline` lại thành đồng hồ không bao giờ reo, và
      // người xin chờ mãi. Đó là lý do mặc định ở đây trái mặc định SRS.
      const { useCase, requests } = makeUseCase({});

      const result = await useCase.handle({});

      expect(result.skippedByPolicy).toBe(false);
      expect(requests.findPostsDueForSelection).toHaveBeenCalled();
    });

    it('Admin tắt thì KHÔNG quét bài nào', async () => {
      // Kiểm cờ trước khi quét: quét rồi mới dừng là tốn một truy vấn cho một lượt chạy
      // không làm gì.
      const { useCase, requests, adminConfig } = makeUseCase({});
      adminConfig.getConfigValue.mockImplementation(async (key: string) =>
        key === 'allocation.policy' ? { autoCreateTransaction: false } : null,
      );

      const result = await useCase.handle({});

      expect(result.skippedByPolicy).toBe(true);
      expect(requests.findPostsDueForSelection).not.toHaveBeenCalled();
      expect(requests.acceptRequest).not.toHaveBeenCalled();
    });

    it('bị tắt KHÁC không có bài nào — hai tín hiệu riêng', async () => {
      // `selected: []` một mình không phân biệt được "Admin chủ ý dừng" với "không có bài
      // nào tới hạn". Người đọc log cron cần biết mình đang xem cái nào.
      const quiet = makeUseCase({ due: [] });
      const quietResult = await quiet.useCase.handle({});

      const off = makeUseCase({});
      off.adminConfig.getConfigValue.mockImplementation(async (key: string) =>
        key === 'allocation.policy' ? { autoCreateTransaction: false } : null,
      );
      const offResult = await off.useCase.handle({});

      expect(quietResult.selected).toEqual([]);
      expect(offResult.selected).toEqual([]);
      expect(quietResult.skippedByPolicy).toBe(false);
      expect(offResult.skippedByPolicy).toBe(true);
    });

    it('cấu hình hỏng thì coi như BẬT, không tự tắt', async () => {
      const { useCase, requests, adminConfig } = makeUseCase({});
      adminConfig.getConfigValue.mockResolvedValue(
        'khong-phai-object' as never,
      );

      const result = await useCase.handle({});

      expect(result.skippedByPolicy).toBe(false);
      expect(requests.findPostsDueForSelection).toHaveBeenCalled();
    });
  });
});
