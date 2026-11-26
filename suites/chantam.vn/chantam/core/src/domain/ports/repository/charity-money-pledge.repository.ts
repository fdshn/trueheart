import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';
import { CharityMoneyPledgeStatus } from '@chantam.vn/chantam.core-lib/models';

/**
 * Lời khai ủng hộ tiền cho chiến dịch từ thiện (CR 25/11/2026). Một dòng số liệu RIÊNG với số
 * thực nhận của nhu cầu tiền — không bao giờ cộng lẫn.
 */
export interface ICharityMoneyPledge {
  pledgeId: string;
  campaignId: string;
  fundingNeedId: string | null;
  userId: string;
  pledgedAmount: number;
  status: CharityMoneyPledgeStatus;
  showNamePublicly: boolean;
  note: string | null;
  bankAccountId: string | null;
  transferContent: string;
  declaredAt: Date;
  completedAt: Date | null;
  hiddenAt: Date | null;
  hiddenBy: string | null;
  hiddenReason: string | null;
}

/** Tài khoản nhận lúc khai — để dựng lại màn chuyển khoản và đối chiếu sao kê. */
export interface ICharityMoneyPledgeAccount {
  accountId: string;
  bankName: string;
  bankBin: string | null;
  accountNo: string;
  accountName: string;
  validTo: Date | null;
}

/** Người khai — DỮ LIỆU THÔ, nơi gọi dựng qua `toPublicUserProfile`. */
export interface ICharityMoneyPledgeUser {
  globalId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  rank: UserRanks;
}

export interface ICharityMoneyPledgeRow extends ICharityMoneyPledge {
  /** `null` khi tài khoản đã bị xoá. */
  user: ICharityMoneyPledgeUser | null;
  account: ICharityMoneyPledgeAccount | null;
  campaign: { globalId: string; title: string; slug: string };
}

export interface ICharityMoneyPledgeTotals {
  pledgedAmount: number;
  pledgeCount: number;
  byFundingNeed: {
    fundingNeedId: string;
    pledgedAmount: number;
    pledgeCount: number;
  }[];
}

export interface ICharityMoneyPledgeCursor {
  declaredAt: Date;
  id: number;
}

export interface ICharityMoneyPledgePage {
  rows: (ICharityMoneyPledgeRow & { cursorId: number })[];
}

export type CharityMoneyPledgeLockedOutcome =
  | { status: 'UPDATED'; pledge: ICharityMoneyPledge }
  | { status: 'NOT_FOUND' }
  | { status: 'LOCKED' }
  | { status: 'CONFLICT'; pledge: ICharityMoneyPledge };

export interface ICharityMoneyPledgeRepository {
  /**
   * Ghi lời khai. `showNamePublicly = null` → lấy theo `users.show_in_public_supporter_lists`.
   * Trả `null` khi `transferContent` trùng (nơi gọi sinh mã khác rồi thử lại).
   */
  create(input: {
    campaignId: string;
    fundingNeedId: string | null;
    userId: string;
    pledgedAmount: number;
    showNamePublicly: boolean | null;
    note: string | null;
    bankAccountId: string;
    transferContent: string;
  }): Promise<ICharityMoneyPledge | null>;
  findById(pledgeId: string): Promise<ICharityMoneyPledge | null>;
  findRow(pledgeId: string): Promise<ICharityMoneyPledgeRow | null>;
  /**
   * `INTENDED → COMPLETED` của CHÍNH người khai, chỉ khi dự án chưa công bố tổng kết. Điều kiện
   * nằm trong `UPDATE` nên lượt công bố chen giữa không lọt.
   */
  markCompleted(params: {
    pledgeId: string;
    userId: string;
  }): Promise<CharityMoneyPledgeLockedOutcome>;
  /** Ẩn (`hidden = true`) hoặc bỏ ẩn, chỉ khi dự án chưa công bố tổng kết. */
  setHidden(params: {
    pledgeId: string;
    hidden: boolean;
    actorId: string;
    reason: string | null;
  }): Promise<CharityMoneyPledgeLockedOutcome>;
  listForCampaign(params: {
    campaignId: string;
    fundingNeedId: string | null;
    status: CharityMoneyPledgeStatus | null;
    includeHidden: boolean;
    cursor: ICharityMoneyPledgeCursor | null;
    limit: number;
  }): Promise<ICharityMoneyPledgePage>;
  listMine(params: {
    userId: string;
    campaignId: string | null;
    cursor: ICharityMoneyPledgeCursor | null;
    limit: number;
  }): Promise<ICharityMoneyPledgePage>;
  /** Tổng lời khai `COMPLETED` chưa ẩn — số công khai. */
  totals(campaignId: string): Promise<ICharityMoneyPledgeTotals>;
  /** Lời khai được cộng điểm khi dự án kết thúc: `COMPLETED`, chưa ẩn. */
  listAwardable(campaignId: string): Promise<ICharityMoneyPledge[]>;
  /**
   * Dự án đã công bố tổng kết trong `days` ngày mà còn lời khai được cộng điểm chưa có award —
   * vá khoảng hở giữa lượt công bố và lượt ghi award.
   */
  listCampaignsWithUnawardedPledges(
    days: number,
    limit: number,
  ): Promise<string[]>;
}

export const ICharityMoneyPledgeRepository = Symbol(
  'ICharityMoneyPledgeRepository',
);
