import {
  ICharityCampaignDistribution,
  ICharityCampaignDistributionInput,
  ICharityPhase,
  ICharitySupportNeed,
  ICharitySupportNeedExternal,
  ICharitySupportNeedInput,
  ICharitySupportOffer,
} from '@/domain/ports/repository';
import {
  CharityCompletionBlocker,
  CharitySupportOfferDecision,
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

// ── Hình thức trao cấp chiến dịch (CR 22/11/2026) ───────────────────────

export interface IGetCharityDistributionUseCase extends IUseCase<
  ICharityProjectCommand,
  ICharityCampaignDistribution | null
> {}
export const IGetCharityDistributionUseCase = Symbol(
  'IGetCharityDistributionUseCase',
);

export interface ISaveCharityDistributionCommand extends ICharityProjectCommand {
  readonly distribution: ICharityCampaignDistributionInput;
}
export interface ISaveCharityDistributionUseCase extends IUseCase<
  ISaveCharityDistributionCommand,
  ICharityCampaignDistribution
> {}
export const ISaveCharityDistributionUseCase = Symbol(
  'ISaveCharityDistributionUseCase',
);

export interface ISaveCharityDistributionEvidenceCommand extends ICharityProjectCommand {
  readonly evidenceUrls: string[];
}
export interface ISaveCharityDistributionEvidenceUseCase extends IUseCase<
  ISaveCharityDistributionEvidenceCommand,
  ICharityCampaignDistribution
> {}
export const ISaveCharityDistributionEvidenceUseCase = Symbol(
  'ISaveCharityDistributionEvidenceUseCase',
);

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
