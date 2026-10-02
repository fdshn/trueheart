import { IAppendPointEntryUseCase } from '@/application/contracts/point';
import {
  PointRuleUnavailableException,
  ReportDuplicatedException,
  ReportInvalidStateException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IReportRepository,
} from '@/domain/ports/repository';
import {
  NotificationTypes,
  ReportReasons,
  ReportStatuses,
  ReportTargetTypes,
} from '@chantam.vn/chantam.core-lib/consts';
import { IReportDto } from '@chantam.vn/chantam.core-lib/dto';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  CreateReportUseCase,
  ListAdminReportsUseCase,
  ReviewReportUseCase,
} from './report.use-cases';

const ActorId = '11111111-1111-4111-8111-111111111111';
const TargetId = '22222222-2222-4222-8222-222222222222';
const ReportId = '33333333-3333-4333-8333-333333333333';
const ReporterId = '44444444-4444-4444-8444-444444444444';

function reportDto(status = ReportStatuses.PENDING): IReportDto {
  return {
    reportId: ReportId,
    reporterUserId: ActorId,
    reporterUsername: 'member',
    targetType: ReportTargetTypes.POST,
    targetId: TargetId,
    targetLabel: 'Bài cần báo cáo',
    reason: ReportReasons.SCAM,
    description: 'Yêu cầu chuyển khoản ngoài nền tảng',
    evidenceUrls: [],
    status,
    targetOpenReportCount: 2,
    reviewedByUserId: null,
    reviewNote: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function admin(allowed = true): jest.Mocked<IAdminConfigRepository> {
  return { hasPermission: jest.fn().mockResolvedValue(allowed) } as never;
}

function points(): jest.Mocked<IAppendPointEntryUseCase> {
  return {
    handle: jest.fn().mockResolvedValue({ applied: true }),
  } as never;
}

/**
 * Đường thông báo giả. Ca "có báo đúng hai bên không" nằm ngay dưới, ở nhóm
 * `ReviewReportUseCase — thông báo`.
 */
function notifier() {
  return {
    handle: jest.fn().mockResolvedValue({ created: true, pushedDevices: 0 }),
  } as never;
}

/**
 * Use case đổi trạng thái tài khoản, dạng giả.
 *
 * `ReviewReportUseCase` gọi lại NGUYÊN use case thật ở production — kể cả phần kiểm
 * `admin.manage` và phần thu hồi token. Mock ở đây để đo "có gọi đúng tham số không";
 * bản thân việc khoá và thu hồi đã có phép kiểm riêng của nó.
 */
function statusChanger(revokedSessions = 3) {
  return {
    handle: jest.fn(async (command: Record<string, unknown>) => ({
      user: { id: command.targetUserId, status: 'BANNED' },
      revokedSessions,
    })),
  };
}

/**
 * Throttle luôn cho qua.
 *
 * Trần GỬI báo xấu thêm 29/09 (10/ngày, 3/phút). Mock cho qua ở đây vì những phép
 * kiểm này đo luật nghiệp vụ của việc báo, không đo trần — trần có phép kiểm riêng
 * trên Redis thật.
 */
function makeThrottle() {
  return {
    assertWithinLimit: jest.fn(async () => undefined),
    registerHit: jest.fn(async () => undefined),
  } as never;
}

describe('CreateReportUseCase', () => {
  it('tạo report PENDING cho target hợp lệ', async () => {
    const reports = {
      targetExists: jest.fn().mockResolvedValue(true),
      findOpenByReporterAndTarget: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(undefined),
      findAdminByGlobalId: jest.fn().mockResolvedValue(reportDto()),
    } as unknown as jest.Mocked<IReportRepository>;
    const result = await new CreateReportUseCase(
      reports,
      makeThrottle(),
    ).handle({
      reporterUserId: ActorId,
      report: {
        targetType: ReportTargetTypes.POST,
        targetId: TargetId,
        reason: ReportReasons.SCAM,
        description: '  Yêu cầu chuyển khoản ngoài nền tảng  ',
      },
    });
    expect(reports.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ReportStatuses.PENDING,
        description: 'Yêu cầu chuyển khoản ngoài nền tảng',
      }),
    );
    expect(result.report.reportId).toBe(ReportId);
  });

  it('nhận đích BÌNH LUẬN, dùng chung hàng đợi Admin với bài và người dùng', async () => {
    // Trước khi gộp, báo xấu bình luận nằm ở bảng riêng mà không đường code
    // nào đọc — tức là báo xong không ai xử.
    const reports = {
      targetExists: jest.fn().mockResolvedValue(true),
      findOpenByReporterAndTarget: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(undefined),
      findAdminByGlobalId: jest.fn().mockResolvedValue(reportDto()),
    } as unknown as jest.Mocked<IReportRepository>;

    await new CreateReportUseCase(reports, makeThrottle()).handle({
      reporterUserId: ActorId,
      report: {
        targetType: ReportTargetTypes.COMMENT,
        targetId: TargetId,
        reason: ReportReasons.HARASSMENT,
        description: 'Bình luận xúc phạm người nhận',
      },
    });

    expect(reports.targetExists).toHaveBeenCalledWith(
      ReportTargetTypes.COMMENT,
      TargetId,
    );
    expect(reports.create).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: ReportTargetTypes.COMMENT,
        status: ReportStatuses.PENDING,
      }),
    );
  });

  it('bình luận đã gỡ thì không báo xấu được', async () => {
    const reports = {
      targetExists: jest.fn().mockResolvedValue(false),
      findOpenByReporterAndTarget: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<IReportRepository>;

    await expect(
      new CreateReportUseCase(reports, makeThrottle()).handle({
        reporterUserId: ActorId,
        report: {
          targetType: ReportTargetTypes.COMMENT,
          targetId: TargetId,
          reason: ReportReasons.HARASSMENT,
          description: 'Bình luận xúc phạm người nhận',
        },
      }),
    ).rejects.toBeInstanceOf(
      (await import('@/domain/exceptions')).ContentCommentNotFoundException,
    );
    expect(reports.create).not.toHaveBeenCalled();
  });

  it('chặn report trùng đang mở', async () => {
    const reports = {
      targetExists: jest.fn().mockResolvedValue(true),
      findOpenByReporterAndTarget: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<IReportRepository>;
    await expect(
      new CreateReportUseCase(reports, makeThrottle()).handle({
        reporterUserId: ActorId,
        report: {
          targetType: ReportTargetTypes.POST,
          targetId: TargetId,
          reason: ReportReasons.SCAM,
          description: 'Nội dung đủ dài để báo cáo',
        },
      }),
    ).rejects.toBeInstanceOf(ReportDuplicatedException);
  });

  it('chặn mô tả chỉ có khoảng trắng', async () => {
    const reports = {} as jest.Mocked<IReportRepository>;
    await expect(
      new CreateReportUseCase(reports, makeThrottle()).handle({
        reporterUserId: ActorId,
        report: {
          targetType: ReportTargetTypes.POST,
          targetId: TargetId,
          reason: ReportReasons.SCAM,
          description: '             ',
        },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });
});

describe('ListAdminReportsUseCase', () => {
  it('mặc định lấy PENDING sau khi kiểm quyền', async () => {
    const reports = {
      findAdminReports: jest
        .fn()
        .mockResolvedValue({ items: [reportDto()], total: 1 }),
    } as unknown as jest.Mocked<IReportRepository>;
    const result = await new ListAdminReportsUseCase(reports, admin()).handle({
      actorUserId: ActorId,
      page: 1,
      pageSize: 20,
    });
    expect(reports.findAdminReports).toHaveBeenCalledWith(
      expect.objectContaining({ status: ReportStatuses.PENDING }),
    );
    expect(result.meta.total).toBe(1);
  });

  it('từ chối trước khi query nếu thiếu report.read', async () => {
    const reports = {
      findAdminReports: jest.fn(),
    } as unknown as jest.Mocked<IReportRepository>;
    await expect(
      new ListAdminReportsUseCase(reports, admin(false)).handle({
        actorUserId: ActorId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(reports.findAdminReports).not.toHaveBeenCalled();
  });
});

describe('ReviewReportUseCase', () => {
  it('ghi quyết định và trả report mới', async () => {
    const reports = {
      findAdminByGlobalId: jest
        .fn()
        .mockResolvedValueOnce(reportDto())
        .mockResolvedValueOnce(reportDto(ReportStatuses.RESOLVED)),
      reviewByAdmin: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<IReportRepository>;
    const result = await new ReviewReportUseCase(
      reports,
      admin(),
      points(),
      notifier(),
      statusChanger() as never,
    ).handle({
      actorUserId: ActorId,
      reportId: ReportId,
      review: { status: ReportStatuses.RESOLVED, note: '  Đã xác minh  ' },
    });
    expect(reports.reviewByAdmin).toHaveBeenCalledWith({
      actorUserId: ActorId,
      reportId: ReportId,
      status: ReportStatuses.RESOLVED,
      note: 'Đã xác minh',
    });
    expect(result.report.status).toBe(ReportStatuses.RESOLVED);
  });

  it('báo conflict khi report vừa được xử lý bởi admin khác', async () => {
    const reports = {
      findAdminByGlobalId: jest.fn().mockResolvedValue(reportDto()),
      reviewByAdmin: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<IReportRepository>;
    await expect(
      new ReviewReportUseCase(
        reports,
        admin(),
        points(),
        notifier(),
        statusChanger() as never,
      ).handle({
        actorUserId: ActorId,
        reportId: ReportId,
        review: { status: ReportStatuses.DISMISSED, note: 'Không có vi phạm' },
      }),
    ).rejects.toBeInstanceOf(ReportInvalidStateException);
  });

  it('RESOLVED thì thưởng người báo, khoá chống trùng theo báo cáo', async () => {
    // Thưởng SAU khi Admin xác minh, không phải lúc gửi: thưởng ngay là trả
    // tiền cho việc bấm nút.
    const reports = {
      findAdminByGlobalId: jest
        .fn()
        .mockResolvedValueOnce(reportDto())
        .mockResolvedValueOnce(reportDto(ReportStatuses.RESOLVED)),
      reviewByAdmin: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<IReportRepository>;
    const award = points();

    await new ReviewReportUseCase(
      reports,
      admin(),
      award,
      notifier(),
      statusChanger() as never,
    ).handle({
      actorUserId: ActorId,
      reportId: ReportId,
      review: { status: ReportStatuses.RESOLVED, note: 'Đã xác minh' },
    });

    expect(award.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ActorId,
        ruleCode: 'REPORT_UPHELD',
        referenceType: 'REPORT',
        referenceId: ReportId,
        idempotencyKey: `REPORT_UPHELD:${ReportId}`,
      }),
    );
  });

  it('DISMISSED thì KHÔNG thưởng — Admin đã bác', async () => {
    const reports = {
      findAdminByGlobalId: jest
        .fn()
        .mockResolvedValueOnce(reportDto())
        .mockResolvedValueOnce(reportDto(ReportStatuses.DISMISSED)),
      reviewByAdmin: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<IReportRepository>;
    const award = points();

    await new ReviewReportUseCase(
      reports,
      admin(),
      award,
      notifier(),
      statusChanger() as never,
    ).handle({
      actorUserId: ActorId,
      reportId: ReportId,
      review: { status: ReportStatuses.DISMISSED, note: 'Không có vi phạm' },
    });

    expect(award.handle).not.toHaveBeenCalled();
  });

  it('rule đang TẮT thì nuốt lỗi, Admin vẫn kết luận được', async () => {
    // Hai rule F41 seed tắt sẵn nên đây là đường chạy MẶC ĐỊNH. Ném ra là
    // Admin không xử được báo xấu nào.
    const reports = {
      findAdminByGlobalId: jest
        .fn()
        .mockResolvedValueOnce(reportDto())
        .mockResolvedValueOnce(reportDto(ReportStatuses.RESOLVED)),
      reviewByAdmin: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<IReportRepository>;
    const award = points();
    award.handle.mockRejectedValue(
      new PointRuleUnavailableException('REPORT_UPHELD'),
    );

    const result = await new ReviewReportUseCase(
      reports,
      admin(),
      award,
      notifier(),
      statusChanger() as never,
    ).handle({
      actorUserId: ActorId,
      reportId: ReportId,
      review: { status: ReportStatuses.RESOLVED, note: 'Đã xác minh' },
    });

    expect(result.report.status).toBe(ReportStatuses.RESOLVED);
  });

  it('nhưng lỗi database thật thì NỔI LÊN', async () => {
    const reports = {
      findAdminByGlobalId: jest
        .fn()
        .mockResolvedValueOnce(reportDto())
        .mockResolvedValueOnce(reportDto(ReportStatuses.RESOLVED)),
      reviewByAdmin: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<IReportRepository>;
    const award = points();
    award.handle.mockRejectedValue(new Error('connection terminated'));

    await expect(
      new ReviewReportUseCase(
        reports,
        admin(),
        award,
        notifier(),
        statusChanger() as never,
      ).handle({
        actorUserId: ActorId,
        reportId: ReportId,
        review: { status: ReportStatuses.RESOLVED, note: 'Đã xác minh' },
      }),
    ).rejects.toThrow('connection terminated');
  });

  it('chặn ghi chú xử lý chỉ có khoảng trắng', async () => {
    const reports = {} as jest.Mocked<IReportRepository>;
    await expect(
      new ReviewReportUseCase(
        reports,
        admin(),
        points(),
        notifier(),
        statusChanger() as never,
      ).handle({
        actorUserId: ActorId,
        reportId: ReportId,
        review: { status: ReportStatuses.RESOLVED, note: '   ' },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });
});

describe('ReviewReportUseCase — thông báo', () => {
  function setup(
    options: { status?: ReportStatuses; owner?: string | null } = {},
  ) {
    const reports = {
      findAdminByGlobalId: jest.fn().mockResolvedValue({
        reportId: ReportId,
        reporterUserId: ReporterId,
        targetType: ReportTargetTypes.POST,
        targetId: TargetId,
      }),
      reviewByAdmin: jest.fn().mockResolvedValue(true),
      findTargetOwner: jest
        .fn()
        .mockResolvedValue(
          options.owner === undefined ? 'owner-1' : options.owner,
        ),
    };
    const dispatch = {
      handle: jest.fn().mockResolvedValue({ created: true, pushedDevices: 0 }),
    };
    const useCase = new ReviewReportUseCase(
      reports as never,
      admin(),
      points(),
      dispatch as never,
      statusChanger() as never,
    );

    return { useCase, reports, dispatch };
  }

  it('báo cho người gửi khi báo xấu được xác minh', async () => {
    const { useCase, dispatch } = setup();

    await useCase.handle({
      actorUserId: ActorId,
      reportId: ReportId,
      review: { status: ReportStatuses.RESOLVED, note: 'Đúng là lừa đảo' },
    });

    expect(dispatch.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ReporterId,
        type: NotificationTypes.REPORT_REVIEWED,
      }),
    );
  });

  it('cũng báo cho người gửi khi báo xấu bị bác', async () => {
    // Không báo thì họ không biết mình sai, và sẽ báo lại y như vậy lần sau.
    const { useCase, dispatch } = setup();

    await useCase.handle({
      actorUserId: ActorId,
      reportId: ReportId,
      review: { status: ReportStatuses.DISMISSED, note: 'Không vi phạm' },
    });

    const reporterCall = dispatch.handle.mock.calls.find(
      (call) => call[0].userId === ReporterId,
    );
    expect(reporterCall?.[0].body).toContain('không vi phạm');
  });

  it('báo cho người bị xử lý CHỈ khi báo xấu được xác minh', async () => {
    const { useCase, dispatch } = setup();

    await useCase.handle({
      actorUserId: ActorId,
      reportId: ReportId,
      review: { status: ReportStatuses.RESOLVED, note: 'Hàng cấm' },
    });

    expect(dispatch.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-1',
        type: NotificationTypes.CONTENT_MODERATED,
      }),
    );
  });

  it('báo xấu bị bác thì KHÔNG báo cho người bị nhắm tới', async () => {
    // Họ chưa làm gì sai, và nói "có người báo bạn" là mời một cuộc cãi vã.
    const { useCase, dispatch } = setup();

    await useCase.handle({
      actorUserId: ActorId,
      reportId: ReportId,
      review: { status: ReportStatuses.DISMISSED, note: 'Không vi phạm' },
    });

    expect(
      dispatch.handle.mock.calls.some(
        (call) => call[0].type === NotificationTypes.CONTENT_MODERATED,
      ),
    ).toBe(false);
  });

  it('không tự báo chính mình khi người báo cũng là chủ nội dung', async () => {
    const { useCase, dispatch } = setup({ owner: ReporterId });

    await useCase.handle({
      actorUserId: ActorId,
      reportId: ReportId,
      review: { status: ReportStatuses.RESOLVED, note: 'Tự báo bài mình' },
    });

    expect(
      dispatch.handle.mock.calls.some(
        (call) => call[0].type === NotificationTypes.CONTENT_MODERATED,
      ),
    ).toBe(false);
  });

  it('nội dung đã biến mất thì bỏ qua, không ném', async () => {
    const { useCase } = setup({ owner: null });

    await expect(
      useCase.handle({
        actorUserId: ActorId,
        reportId: ReportId,
        review: { status: ReportStatuses.RESOLVED, note: 'Đã gỡ trước đó' },
      }),
    ).resolves.toBeDefined();
  });

  it('thông báo lỗi KHÔNG làm hỏng kết luận của Admin', async () => {
    // Admin đã xem xét và quyết định là một SỰ THẬT đã ghi; ném ở đây khiến họ
    // không kết luận được báo xấu nào.
    const { useCase, dispatch } = setup();
    dispatch.handle.mockRejectedValue(new Error('kênh đẩy chết'));

    await expect(
      useCase.handle({
        actorUserId: ActorId,
        reportId: ReportId,
        review: { status: ReportStatuses.RESOLVED, note: 'Đúng là lừa đảo' },
      }),
    ).resolves.toBeDefined();
  });
});

describe('ReviewReportUseCase — chế tài (F49, mục mở L4)', () => {
  const OwnerId = '90000000-0000-4000-8000-000000000009';

  function reportsFor(
    options: { targetType?: ReportTargetTypes; owner?: string | null } = {},
  ) {
    const dto = {
      ...reportDto(),
      targetType: options.targetType ?? ReportTargetTypes.POST,
    };
    return {
      findAdminByGlobalId: jest
        .fn()
        .mockResolvedValueOnce(dto)
        .mockResolvedValueOnce({ ...dto, status: ReportStatuses.RESOLVED }),
      reviewByAdmin: jest.fn().mockResolvedValue(true),
      // Phản chiếu repository thật: đích là NGƯỜI thì chủ chính là `targetId`.
      findTargetOwner: jest.fn(async (type: ReportTargetTypes, id: string) => {
        if (type === ReportTargetTypes.USER) return id;
        return options.owner === undefined ? OwnerId : options.owner;
      }),
    } as unknown as jest.Mocked<IReportRepository>;
  }

  const upheld = {
    actorUserId: ActorId,
    reportId: ReportId,
    review: {
      status: ReportStatuses.RESOLVED as ReportStatuses.RESOLVED,
      note: 'Đã xác minh gian lận',
    },
  };

  it('không gửi enforcement thì không chạm tới tài khoản nào', async () => {
    const changer = statusChanger();
    const result = await new ReviewReportUseCase(
      reportsFor(),
      admin(),
      points(),
      notifier(),
      changer as never,
    ).handle(upheld);

    expect(changer.handle).not.toHaveBeenCalled();
    expect(result.enforcement.action).toBe('NONE');
    // Luôn có mặt, kể cả khi không áp gì: `undefined` buộc client phân biệt "không áp"
    // với "thiếu trường".
    expect(result.enforcement.targetUserId).toBeNull();
    expect(result.enforcement.revokedSessions).toBe(0);
  });

  it('BAN_USER trên báo xấu nhắm vào NỘI DUNG áp lên CHỦ nội dung', async () => {
    // Đây là chính việc L4 nói Admin phải tự đi tìm tay.
    const reports = reportsFor();
    const changer = statusChanger(5);

    const result = await new ReviewReportUseCase(
      reports,
      admin(),
      points(),
      notifier(),
      changer as never,
    ).handle({ ...upheld, enforcement: { action: 'BAN_USER' as const } });

    expect(reports.findTargetOwner).toHaveBeenCalledWith(
      ReportTargetTypes.POST,
      TargetId,
    );
    const call = changer.handle.mock.calls[0][0] as {
      targetUserId: string;
      statusChange: {
        status: string;
        suspendedUntil: Date | null;
        reason: string;
      };
    };
    expect(call.targetUserId).toBe(OwnerId);
    expect(call.statusChange.status).toBe('BANNED');
    // Khoá vĩnh viễn không tự gỡ, nên một mốc hết hạn ở đó là lời hứa sai.
    expect(call.statusChange.suspendedUntil).toBeNull();
    // Lý do mang theo ghi chú của Admin để hai bản ghi đọc ra cùng một câu chuyện.
    expect(call.statusChange.reason).toContain('Đã xác minh gian lận');
    expect(result.enforcement.revokedSessions).toBe(5);
  });

  it('báo xấu nhắm vào USER thì áp thẳng, không hỏi chủ nội dung', async () => {
    const reports = reportsFor({ targetType: ReportTargetTypes.USER });
    const changer = statusChanger();

    await new ReviewReportUseCase(
      reports,
      admin(),
      points(),
      notifier(),
      changer as never,
    ).handle({ ...upheld, enforcement: { action: 'BAN_USER' as const } });

    // `findTargetOwner` CÓ được gọi — repository tự trả `targetId` khi đích là NGƯỜI,
    // và use case dùng thẳng nó thay vì tự xét `targetType`. Bằng chứng nhánh USER chạy
    // đúng là tài khoản nhận chế tài bằng `targetId`, không bằng `OwnerId`.
    expect(reports.findTargetOwner).toHaveBeenCalledWith(
      ReportTargetTypes.USER,
      TargetId,
    );
    expect(
      (changer.handle.mock.calls[0][0] as { targetUserId: string })
        .targetUserId,
    ).toBe(TargetId);
  });

  it('SUSPEND_USER tính mốc hết treo từ suspendDays', async () => {
    const changer = statusChanger();

    const result = await new ReviewReportUseCase(
      reportsFor(),
      admin(),
      points(),
      notifier(),
      changer as never,
    ).handle({
      ...upheld,
      enforcement: { action: 'SUSPEND_USER' as const, suspendDays: 7 },
    });

    const call = changer.handle.mock.calls[0][0] as {
      statusChange: { status: string; suspendedUntil: Date | null };
    };
    expect(call.statusChange.status).toBe('SUSPENDED');
    const until = call.statusChange.suspendedUntil;
    expect(until).not.toBeNull();
    const days = Math.round(
      ((until as Date).getTime() - Date.now()) / (24 * 60 * 60 * 1_000),
    );
    expect(days).toBe(7);
    expect(result.enforcement.suspendedUntil).toEqual(until);
  });

  it('chế tài trên báo xấu BỊ BÁC bị từ chối, và KHÔNG ghi kết luận', async () => {
    // Kiểm TRƯỚC khi ghi: nếu kiểm sau thì lượt gọi hỏng để lại một báo xấu đã đóng
    // mà không có chế tài nào, và Admin phải tự biết là lượt thứ hai mới cần làm lại.
    const reports = reportsFor();
    const changer = statusChanger();

    await expect(
      new ReviewReportUseCase(
        reports,
        admin(),
        points(),
        notifier(),
        changer as never,
      ).handle({
        actorUserId: ActorId,
        reportId: ReportId,
        review: {
          status: ReportStatuses.DISMISSED as ReportStatuses.DISMISSED,
          note: 'Không vi phạm',
        },
        enforcement: { action: 'BAN_USER' as const },
      }),
    ).rejects.toThrow();

    expect(reports.reviewByAdmin).not.toHaveBeenCalled();
    expect(changer.handle).not.toHaveBeenCalled();
  });

  it('không tìm được chủ nội dung thì từ chối trước khi ghi', async () => {
    const reports = reportsFor({ owner: null });
    const changer = statusChanger();

    await expect(
      new ReviewReportUseCase(
        reports,
        admin(),
        points(),
        notifier(),
        changer as never,
      ).handle({ ...upheld, enforcement: { action: 'BAN_USER' as const } }),
    ).rejects.toThrow();

    expect(reports.reviewByAdmin).not.toHaveBeenCalled();
  });

  it('tự áp chế tài lên chính mình bị từ chối', async () => {
    const reports = reportsFor({ owner: ActorId });
    const changer = statusChanger();

    await expect(
      new ReviewReportUseCase(
        reports,
        admin(),
        points(),
        notifier(),
        changer as never,
      ).handle({ ...upheld, enforcement: { action: 'BAN_USER' as const } }),
    ).rejects.toThrow();

    expect(reports.reviewByAdmin).not.toHaveBeenCalled();
  });

  it('action lạ coi như không chế tài, không coi như BAN', async () => {
    const changer = statusChanger();

    const result = await new ReviewReportUseCase(
      reportsFor(),
      admin(),
      points(),
      notifier(),
      changer as never,
    ).handle({
      ...upheld,
      enforcement: { action: 'XOA_SACH' } as never,
    });

    expect(changer.handle).not.toHaveBeenCalled();
    expect(result.enforcement.action).toBe('NONE');
  });

  it('chế tài hỏng thì NÉM, không nuốt như thông báo', async () => {
    // Thưởng trượt hay thông báo trượt là mất một thứ phụ. Chế tài trượt nghĩa là Admin
    // đọc "đã xử lý" trên một tài khoản vẫn đang hoạt động bình thường.
    const reports = reportsFor();
    const changer = {
      handle: jest.fn().mockRejectedValue(new Error('thiếu admin.manage')),
    };

    await expect(
      new ReviewReportUseCase(
        reports,
        admin(),
        points(),
        notifier(),
        changer as never,
      ).handle({ ...upheld, enforcement: { action: 'BAN_USER' as const } }),
    ).rejects.toThrow('thiếu admin.manage');

    // Kết luận ĐÃ ghi và vẫn còn đó — Admin thử lại chế tài bằng đường riêng.
    expect(reports.reviewByAdmin).toHaveBeenCalled();
  });
});
