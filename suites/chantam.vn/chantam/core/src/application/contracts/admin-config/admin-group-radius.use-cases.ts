import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGroupRadiusRung {
  readonly rank: UserRanks;
  readonly meters: number;
  /** `true` khi bậc này chưa có khoá riêng và đang dùng `defaultMeters`. */
  readonly inherited: boolean;
  /** `true` khi bậc này thật sự tạo được nhóm (`CREATE_GROUP.allowed`). */
  readonly canCreateGroup: boolean;
}

export interface IGroupRadiusPolicy {
  readonly defaultMeters: number;
  readonly minMeters: number;
  readonly maxMeters: number;
  /** Cận TUYỆT ĐỐI của cột `groups.radius_km`, không nới bằng cấu hình. */
  readonly columnBoundsMeters: { readonly min: number; readonly max: number };
  readonly ladder: IGroupRadiusRung[];
}

export interface IGetGroupRadiusPolicyCommand {
  readonly actorUserId: string;
}
export interface IGetGroupRadiusPolicyResult {
  readonly radiusPolicy: IGroupRadiusPolicy;
}
export interface IGetGroupRadiusPolicyUseCase extends IUseCase<
  IGetGroupRadiusPolicyCommand,
  IGetGroupRadiusPolicyResult
> {}
export const IGetGroupRadiusPolicyUseCase = Symbol(
  'IGetGroupRadiusPolicyUseCase',
);

export interface IPublishGroupRadiusPolicyCommand {
  readonly actorUserId: string;
  readonly radiusPolicy: {
    readonly defaultMeters?: number;
    readonly ladder: { readonly rank: UserRanks; readonly meters: number }[];
    readonly reason: string;
  };
}
export interface IPublishGroupRadiusPolicyResult extends IGetGroupRadiusPolicyResult {}
export interface IPublishGroupRadiusPolicyUseCase extends IUseCase<
  IPublishGroupRadiusPolicyCommand,
  IPublishGroupRadiusPolicyResult
> {}
export const IPublishGroupRadiusPolicyUseCase = Symbol(
  'IPublishGroupRadiusPolicyUseCase',
);

/**
 * Bậc có thể đặt bán kính riêng.
 *
 * `VIEWER` không nằm đây: họ chưa qua onboarding nên `assertOnboarded` chặn từ
 * trước khi tới bước bán kính. Cho đặt là seed một khoá không ai đọc, đúng thứ
 * `test:config-inventory` bắt.
 */
export const GroupRadiusLadderRanks: readonly UserRanks[] = [
  UserRanks.MEMBER,
  UserRanks.SILVER,
  UserRanks.GOLD,
  UserRanks.DIAMOND,
];
