import { IPublicUserProfileDto } from '@chantam.vn/chantam.core-lib/dto';
import { CharityMoneyPledgeStatus } from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';

/**
 * Đăng ký ủng hộ tiền cho chiến dịch từ thiện (CR 25/11/2026,
 * docs/plans/2026-11-25-charity-money-pledges.md).
 */

/** Thông tin chuyển khoản để app dựng màn chuyển khoản như Công đức. */
export interface ICharityMoneyPledgeTransfer {
  /**
   * Tài khoản nhận lúc khai đã bị đóng (thay tài khoản khác). Khi đó `vietQrUrl = null` và app
   * KHÔNG được mời chuyển vào tài khoản này — khai lại để nhận tài khoản mới.
   */
  accountClosed: boolean;
  bankName: string;
  bankBin: string | null;
  accountNo: string;
  accountName: string;
  amount: number;
  transferContent: string;
  /** `null` khi tài khoản nhận chưa khai BIN ngân hàng. */
  vietQrUrl: string | null;
}

/** Dòng công khai: không có ghi chú, nội dung chuyển khoản; ẩn tên thì không có `user`. */
export interface ICharityPublicMoneyPledge {
  pledgeId: string;
  fundingNeedId: string | null;
  /** `null` = "Ẩn danh" (người khai chọn ẩn tên, hoặc tài khoản đã xoá). */
  user: IPublicUserProfileDto | null;
  pledgedAmount: number;
  status: CharityMoneyPledgeStatus;
  declaredAt: Date;
  completedAt: Date | null;
}

/** Dòng cho chủ dự án / điều phối viên: thêm ghi chú, nội dung chuyển khoản, tài khoản, trạng thái ẩn. */
export interface ICharityManagedMoneyPledge extends ICharityPublicMoneyPledge {
  /** Người khai luôn hiện với ban tổ chức (để đối chiếu sao kê), kể cả khi ẩn tên công khai. */
  user: IPublicUserProfileDto | null;
  showNamePublicly: boolean;
  note: string | null;
  transferContent: string;
  bankAccount: {
    accountId: string;
    bankName: string;
    accountNo: string;
    accountName: string;
    validTo: Date | null;
  } | null;
  hiddenAt: Date | null;
  hiddenReason: string | null;
}

/** Lời khai của chính tôi. */
export interface ICharityMyMoneyPledge {
  pledgeId: string;
  campaign: { campaignId: string; title: string; slug: string };
  fundingNeedId: string | null;
  pledgedAmount: number;
  status: CharityMoneyPledgeStatus;
  showNamePublicly: boolean;
  note: string | null;
  declaredAt: Date;
  completedAt: Date | null;
  hiddenAt: Date | null;
  hiddenReason: string | null;
  /** `null` khi tài khoản nhận lúc khai đã bị xoá khỏi hệ thống. */
  transfer: ICharityMoneyPledgeTransfer | null;
}

export interface ICharityMoneyPledgePageResult<T> {
  pledges: T[];
  nextCursor: string | null;
}

// ── Người ủng hộ ────────────────────────────────────────────────────────

export interface IDeclareCharityMoneyPledgeCommand {
  readonly userId: string;
  readonly campaignId: string;
  readonly pledge: {
    readonly fundingNeedId?: string | null;
    readonly pledgedAmount: number;
    readonly note?: string | null;
    readonly showNamePublicly?: boolean | null;
  };
}
export interface IDeclareCharityMoneyPledgeResult {
  pledge: ICharityMyMoneyPledge;
  transfer: ICharityMoneyPledgeTransfer;
}
export interface IDeclareCharityMoneyPledgeUseCase extends IUseCase<
  IDeclareCharityMoneyPledgeCommand,
  IDeclareCharityMoneyPledgeResult
> {}
export const IDeclareCharityMoneyPledgeUseCase = Symbol(
  'IDeclareCharityMoneyPledgeUseCase',
);

export interface ICompleteCharityMoneyPledgeCommand {
  readonly userId: string;
  readonly pledgeId: string;
}
export interface ICompleteCharityMoneyPledgeUseCase extends IUseCase<
  ICompleteCharityMoneyPledgeCommand,
  ICharityMyMoneyPledge
> {}
export const ICompleteCharityMoneyPledgeUseCase = Symbol(
  'ICompleteCharityMoneyPledgeUseCase',
);

export interface IListMyCharityMoneyPledgesCommand {
  readonly userId: string;
  readonly campaignId: string | null;
  readonly cursor: string | null;
  readonly limit: number;
}
export interface IListMyCharityMoneyPledgesUseCase extends IUseCase<
  IListMyCharityMoneyPledgesCommand,
  ICharityMoneyPledgePageResult<ICharityMyMoneyPledge>
> {}
export const IListMyCharityMoneyPledgesUseCase = Symbol(
  'IListMyCharityMoneyPledgesUseCase',
);

// ── Công khai ───────────────────────────────────────────────────────────

export interface IListCharityMoneyPledgesFilter {
  readonly fundingNeedId: string | null;
  readonly status: CharityMoneyPledgeStatus | null;
  readonly cursor: string | null;
  readonly limit: number;
}

export interface IListCharityMoneyPledgesCommand extends IListCharityMoneyPledgesFilter {
  readonly idOrSlug: string;
}
export interface IListCharityMoneyPledgesUseCase extends IUseCase<
  IListCharityMoneyPledgesCommand,
  ICharityMoneyPledgePageResult<ICharityPublicMoneyPledge>
> {}
export const IListCharityMoneyPledgesUseCase = Symbol(
  'IListCharityMoneyPledgesUseCase',
);

// ── Chủ dự án / điều phối viên ──────────────────────────────────────────

export interface IManageCharityMoneyPledgesCommand extends IListCharityMoneyPledgesFilter {
  readonly userId: string;
  readonly campaignId: string;
}
export interface IManageCharityMoneyPledgesUseCase extends IUseCase<
  IManageCharityMoneyPledgesCommand,
  ICharityMoneyPledgePageResult<ICharityManagedMoneyPledge>
> {}
export const IManageCharityMoneyPledgesUseCase = Symbol(
  'IManageCharityMoneyPledgesUseCase',
);

export interface ISetCharityMoneyPledgeHiddenCommand {
  readonly userId: string;
  readonly pledgeId: string;
  readonly hidden: boolean;
  readonly reason: string | null;
}
export interface ISetCharityMoneyPledgeHiddenUseCase extends IUseCase<
  ISetCharityMoneyPledgeHiddenCommand,
  ICharityManagedMoneyPledge
> {}
export const ISetCharityMoneyPledgeHiddenUseCase = Symbol(
  'ISetCharityMoneyPledgeHiddenUseCase',
);
