import {
  IGiverAccuracyConfig,
  IReportAbuseConfig,
  IReviewRatingConfig,
} from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';

/**
 * Ba ngưỡng tin cậy lưu dạng JSON trong `system_configs` (CMS A13). Endpoint chung
 * `POST /admin/system-configs` chỉ nhận INTEGER, nên trước đây chúng chỉ đổi được
 * bằng SQL tay.
 */
export interface ITrustThresholdSections {
  readonly giverAccuracy: IGiverAccuracyConfig;
  readonly reviewRating: IReviewRatingConfig;
  readonly reportAbuse: IReportAbuseConfig;
}

export type TrustThresholdSection = keyof ITrustThresholdSections;

export interface ITrustThresholdView<T> {
  /** Giá trị ĐANG CHẠY — đã chuẩn hoá, mặc định khi chưa ai publish. */
  readonly value: T;
  /** `false` khi khoá chưa có trong `system_configs`, hệ thống dùng mặc định. */
  readonly isConfigured: boolean;
}

export type IGetTrustThresholdsResult = {
  readonly [K in TrustThresholdSection]: ITrustThresholdView<
    ITrustThresholdSections[K]
  >;
};

export interface IGetTrustThresholdsCommand {
  readonly actorUserId: string;
}

export interface IGetTrustThresholdsUseCase extends IUseCase<
  IGetTrustThresholdsCommand,
  IGetTrustThresholdsResult
> {}

export const IGetTrustThresholdsUseCase = Symbol('IGetTrustThresholdsUseCase');

export type ISetTrustThresholdCommand = {
  [K in TrustThresholdSection]: {
    readonly actorUserId: string;
    readonly section: K;
    readonly value: ITrustThresholdSections[K];
    readonly reason: string;
  };
}[TrustThresholdSection];

export interface ISetTrustThresholdUseCase extends IUseCase<
  ISetTrustThresholdCommand,
  IGetTrustThresholdsResult
> {}

export const ISetTrustThresholdUseCase = Symbol('ISetTrustThresholdUseCase');
