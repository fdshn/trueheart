import {
  IGetTrustThresholdsCommand,
  IGetTrustThresholdsResult,
  IGetTrustThresholdsUseCase,
  ISetTrustThresholdCommand,
  ISetTrustThresholdUseCase,
  TrustThresholdSection,
} from '@/application/contracts/admin-config';
import { IAdminConfigRepository } from '@/domain/ports/repository';
import {
  GiverAccuracyConfigKey,
  normalizeGiverAccuracyConfig,
  normalizeReportAbuseConfig,
  normalizeReviewRatingConfig,
  ReportAbuseConfigKey,
  ReviewRatingConfigKey,
} from '@chantam.vn/chantam.core-lib/models';
import { ForbiddenException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Khoá và hàm chuẩn hoá của từng phần — CHÍNH hàm mà nơi đọc ngưỡng dùng, nên GET
 * trả đúng thứ hệ thống đang chạy chứ không phải một bản diễn giải thứ hai.
 */
const Sections: {
  readonly [K in TrustThresholdSection]: {
    readonly key: string;
    readonly normalize: (raw: unknown) => unknown;
  };
} = {
  giverAccuracy: {
    key: GiverAccuracyConfigKey,
    normalize: normalizeGiverAccuracyConfig,
  },
  reviewRating: {
    key: ReviewRatingConfigKey,
    normalize: normalizeReviewRatingConfig,
  },
  reportAbuse: {
    key: ReportAbuseConfigKey,
    normalize: normalizeReportAbuseConfig,
  },
};

async function readAll(
  repository: IAdminConfigRepository,
): Promise<IGetTrustThresholdsResult> {
  const view = async (section: TrustThresholdSection) => {
    const raw = await repository.getConfigValue(Sections[section].key);
    return {
      value: Sections[section].normalize(raw),
      isConfigured: typeof raw === 'object' && raw !== null,
    };
  };

  return {
    giverAccuracy: await view('giverAccuracy'),
    reviewRating: await view('reviewRating'),
    reportAbuse: await view('reportAbuse'),
  } as IGetTrustThresholdsResult;
}

@Injectable()
export class GetTrustThresholdsUseCase implements IGetTrustThresholdsUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetTrustThresholdsCommand,
  ): Promise<IGetTrustThresholdsResult> {
    if (
      !(await this.repository.hasPermission(command.actorUserId, 'config.read'))
    )
      throw new ForbiddenException();

    return readAll(this.repository);
  }
}

@Injectable()
export class SetTrustThresholdUseCase implements ISetTrustThresholdUseCase {
  public constructor(
    @Inject(IAdminConfigRepository)
    private readonly repository: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ISetTrustThresholdCommand,
  ): Promise<IGetTrustThresholdsResult> {
    if (
      !(await this.repository.hasPermission(
        command.actorUserId,
        'config.write',
      ))
    )
      throw new ForbiddenException();

    const section = Sections[command.section];
    // Chuẩn hoá TRƯỚC khi ghi, cùng lối allocation-policy: lưu đúng thứ sẽ chạy,
    // nên audit log không nói một ngưỡng mà hệ thống chạy một ngưỡng khác. DTO
    // đã chặn giá trị ngoài khoảng, nên bước này chỉ cắt phần lẻ.
    await this.repository.publishSystemConfig({
      actorUserId: command.actorUserId,
      key: section.key,
      value: section.normalize(command.value),
      valueType: 'JSON',
      reason: command.reason,
    });

    return readAll(this.repository);
  }
}
