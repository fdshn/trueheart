import {
  ReportDuplicatedException,
  ReportInvalidStateException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  IReportRepository,
} from '@/domain/ports/repository';
import {
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

describe('CreateReportUseCase', () => {
  it('tạo report PENDING cho target hợp lệ', async () => {
    const reports = {
      targetExists: jest.fn().mockResolvedValue(true),
      findOpenByReporterAndTarget: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(undefined),
      findAdminByGlobalId: jest.fn().mockResolvedValue(reportDto()),
    } as unknown as jest.Mocked<IReportRepository>;
    const result = await new CreateReportUseCase(reports).handle({
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

  it('chặn report trùng đang mở', async () => {
    const reports = {
      targetExists: jest.fn().mockResolvedValue(true),
      findOpenByReporterAndTarget: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<IReportRepository>;
    await expect(
      new CreateReportUseCase(reports).handle({
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
      new CreateReportUseCase(reports).handle({
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
    const result = await new ReviewReportUseCase(reports, admin()).handle({
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
      new ReviewReportUseCase(reports, admin()).handle({
        actorUserId: ActorId,
        reportId: ReportId,
        review: { status: ReportStatuses.DISMISSED, note: 'Không có vi phạm' },
      }),
    ).rejects.toBeInstanceOf(ReportInvalidStateException);
  });

  it('chặn ghi chú xử lý chỉ có khoảng trắng', async () => {
    const reports = {} as jest.Mocked<IReportRepository>;
    await expect(
      new ReviewReportUseCase(reports, admin()).handle({
        actorUserId: ActorId,
        reportId: ReportId,
        review: { status: ReportStatuses.RESOLVED, note: '   ' },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });
});
