import {
  ICharityPhase,
  ICharityRound,
  ICharityRoundInput,
  ICharitySupportNeed,
  ICharitySupportNeedExternal,
  ICharitySupportNeedInput,
  ICharitySupportOffer,
} from '@/domain/ports/repository';
import {
  CharityCompletionBlocker,
  CharityRoundReadiness,
  CharityRoundWarningCode,
  CharitySupportOfferDecision,
  ICharityRoundChecklistItem,
} from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';
import { ICharityProjectCommand } from './charity-project.contract';

/**
 * Dự án từ thiện — đợt 5b/5c, quyết định 05/11 (CHARITY-PROJECT-LIFECYCLE §3.2, §3.4, §3.11,
 * §3.18): hỗ trợ mở, hoãn bước trao, nhiều đợt trao, điều kiện hoàn tất dự án.
 */

// ── Hỗ trợ mở ───────────────────────────────────────────────────────────────

/** Bản công khai: không có số điện thoại người phụ trách. */
export type ICharitySupportNeedPublic = Omit<ICharitySupportNeed, 'picPhone'>;

export interface IListCharitySupportNeedsUseCase extends IUseCase<
  { idOrSlug: string },
  ICharitySupportNeedPublic[]
> {}
export const IListCharitySupportNeedsUseCase = Symbol(
  'IListCharitySupportNeedsUseCase',
);

export interface IManageCharitySupportNeedsUseCase extends IUseCase<
  ICharityProjectCommand,
  ICharitySupportNeed[]
> {}
export const IManageCharitySupportNeedsUseCase = Symbol(
  'IManageCharitySupportNeedsUseCase',
);

export interface ISaveCharitySupportNeedCommand extends ICharityProjectCommand {
  /** `null` = tạo mới. */
  readonly supportNeedId: string | null;
  readonly need: ICharitySupportNeedInput;
  readonly external?: ICharitySupportNeedExternal;
  readonly status?: 'OPEN' | 'CLOSED';
}
export interface ISaveCharitySupportNeedUseCase extends IUseCase<
  ISaveCharitySupportNeedCommand,
  ICharitySupportNeed
> {}
export const ISaveCharitySupportNeedUseCase = Symbol(
  'ISaveCharitySupportNeedUseCase',
);

export interface IDeleteCharitySupportNeedCommand extends ICharityProjectCommand {
  readonly supportNeedId: string;
}
export interface IDeleteCharitySupportNeedUseCase extends IUseCase<
  IDeleteCharitySupportNeedCommand,
  { deleted: true }
> {}
export const IDeleteCharitySupportNeedUseCase = Symbol(
  'IDeleteCharitySupportNeedUseCase',
);

export interface IOfferCharitySupportCommand extends ICharityProjectCommand {
  readonly supportNeedId: string;
  readonly quantity: number;
  readonly note: string | null;
}
export interface IOfferCharitySupportUseCase extends IUseCase<
  IOfferCharitySupportCommand,
  ICharitySupportOffer
> {}
export const IOfferCharitySupportUseCase = Symbol(
  'IOfferCharitySupportUseCase',
);

export interface IListCharitySupportOffersCommand extends ICharityProjectCommand {
  readonly supportNeedId: string | null;
  /** `true` = chỉ đề nghị của chính người gọi (ai cũng xem được của mình). */
  readonly mine: boolean;
}
export interface IListCharitySupportOffersUseCase extends IUseCase<
  IListCharitySupportOffersCommand,
  ICharitySupportOffer[]
> {}
export const IListCharitySupportOffersUseCase = Symbol(
  'IListCharitySupportOffersUseCase',
);

export interface IDecideCharitySupportOfferCommand extends ICharityProjectCommand {
  readonly offerId: string;
  readonly action: CharitySupportOfferDecision;
  readonly reason: string | null;
  /** Với `COMPLETE`: số thực làm; bỏ trống = đủ số đã nhận. */
  readonly completedQuantity: number | null;
}
export interface IDecideCharitySupportOfferUseCase extends IUseCase<
  IDecideCharitySupportOfferCommand,
  ICharitySupportOffer
> {}
export const IDecideCharitySupportOfferUseCase = Symbol(
  'IDecideCharitySupportOfferUseCase',
);

export interface IWithdrawCharitySupportOfferCommand extends ICharityProjectCommand {
  readonly offerId: string;
}
export interface IWithdrawCharitySupportOfferUseCase extends IUseCase<
  IWithdrawCharitySupportOfferCommand,
  ICharitySupportOffer
> {}
export const IWithdrawCharitySupportOfferUseCase = Symbol(
  'IWithdrawCharitySupportOfferUseCase',
);

// ── Hoãn bước trao (§3.2) ──────────────────────────────────────────────────

export interface IPostponeCharityDistributionCommand extends ICharityProjectCommand {
  readonly startsAt: Date;
  /** Bỏ trống = giữ nguyên độ dài bước trao. */
  readonly endsAt: Date | null;
  readonly reason: string;
}
export interface IPostponeCharityDistributionUseCase extends IUseCase<
  IPostponeCharityDistributionCommand,
  ICharityPhase[]
> {}
export const IPostponeCharityDistributionUseCase = Symbol(
  'IPostponeCharityDistributionUseCase',
);

// ── Đợt trao (§3.18) ────────────────────────────────────────────────────────

export interface ICharityRoundView extends ICharityRound {
  /** Cảnh báo trước 48 giờ — chỉ để thấy, không tự huỷ hay chặn (§3.4). */
  warnings: CharityRoundWarningCode[];
}

/** Bản công khai: không có ghi chú sẵn sàng, checklist nội bộ, người xác nhận. */
export type ICharityRoundPublic = Omit<
  ICharityRound,
  'readiness' | 'readinessNote' | 'readinessBy' | 'readinessAt' | 'checklist'
>;

export interface IListCharityRoundsUseCase extends IUseCase<
  { idOrSlug: string },
  ICharityRoundPublic[]
> {}
export const IListCharityRoundsUseCase = Symbol('IListCharityRoundsUseCase');

export interface IManageCharityRoundsUseCase extends IUseCase<
  ICharityProjectCommand,
  ICharityRoundView[]
> {}
export const IManageCharityRoundsUseCase = Symbol(
  'IManageCharityRoundsUseCase',
);

export interface ISaveCharityRoundCommand extends ICharityProjectCommand {
  readonly roundId: string | null;
  readonly round: ICharityRoundInput;
  /** Bắt buộc khi đổi giờ / địa điểm đợt của dự án đã duyệt (báo người bị ảnh hưởng). */
  readonly reason: string | null;
}
export interface ISaveCharityRoundUseCase extends IUseCase<
  ISaveCharityRoundCommand,
  ICharityRoundView
> {}
export const ISaveCharityRoundUseCase = Symbol('ISaveCharityRoundUseCase');

export interface ISetCharityRoundStatusCommand extends ICharityProjectCommand {
  readonly roundId: string;
  readonly status: 'DONE' | 'CANCELLED';
  readonly reason: string | null;
}
export interface ISetCharityRoundStatusUseCase extends IUseCase<
  ISetCharityRoundStatusCommand,
  ICharityRoundView
> {}
export const ISetCharityRoundStatusUseCase = Symbol(
  'ISetCharityRoundStatusUseCase',
);

export interface ISetCharityRoundReadinessCommand extends ICharityProjectCommand {
  readonly roundId: string;
  readonly readiness: Exclude<CharityRoundReadiness, 'PENDING'>;
  readonly note: string | null;
  readonly checklist: Partial<ICharityRoundChecklistItem>[];
}
export interface ISetCharityRoundReadinessUseCase extends IUseCase<
  ISetCharityRoundReadinessCommand,
  ICharityRoundView
> {}
export const ISetCharityRoundReadinessUseCase = Symbol(
  'ISetCharityRoundReadinessUseCase',
);

export interface IAssignCharityRoundCommand extends ICharityProjectCommand {
  /** `null` = gỡ khỏi đợt. */
  readonly roundId: string | null;
  readonly participationIds: string[];
  readonly deliveryIds: string[];
}
export interface IAssignCharityRoundUseCase extends IUseCase<
  IAssignCharityRoundCommand,
  { participations: number; deliveries: number }
> {}
export const IAssignCharityRoundUseCase = Symbol('IAssignCharityRoundUseCase');

// ── Hoàn tất dự án (§3.18) ──────────────────────────────────────────────────

export interface ICharityCompletionCheck {
  canComplete: boolean;
  blockers: { code: CharityCompletionBlocker; label: string }[];
}
export interface ICheckCharityCompletionUseCase extends IUseCase<
  ICharityProjectCommand,
  ICharityCompletionCheck
> {}
export const ICheckCharityCompletionUseCase = Symbol(
  'ICheckCharityCompletionUseCase',
);
