import {
  CharityCompletionBlocker,
  CharityDisputeParty,
  CharityDisputeReason,
  CharityDisputeStatus,
  CharityRoundReadiness,
  CharityRoundStatus,
  CharitySupportOfferStatus,
  CharitySupportType,
  ICharityRoundChecklistItem,
} from '@chantam.vn/chantam.core-lib/models';
import { ICharityUserBrief } from './charity-event.repository';

// ── Hỗ trợ mở (§3.11) ───────────────────────────────────────────────────────

export interface ICharitySupportNeedInput {
  supportType: CharitySupportType;
  title: string;
  description: string | null;
  unit: string;
  targetQuantity: number;
  startsAt: Date | null;
  endsAt: Date | null;
  locationLabel: string | null;
  requirements: string | null;
  handoverMethod: string | null;
  picName: string | null;
  picPhone: string | null;
  sortOrder: number;
}

export interface ICharitySupportNeedExternal {
  quantity: number;
  evidenceUrls: string[];
  note: string | null;
}

/** Cùng cách tổng hợp mọi nhóm nhu cầu: đăng ký, chấp nhận, hoàn thành, nguồn ngoài, còn thiếu. */
export interface ICharitySupportNeed extends ICharitySupportNeedInput {
  supportNeedId: string;
  campaignId: string;
  status: 'OPEN' | 'CLOSED';
  external: ICharitySupportNeedExternal;
  /** Số đang chờ ban tổ chức xét. */
  pendingQuantity: number;
  acceptedQuantity: number;
  /** Đã hoàn thành trong app (theo số thực làm). */
  completedQuantity: number;
  remainingQuantity: number;
  offerCount: number;
  updatedAt: Date;
}

export interface ICharitySupportOffer {
  offerId: string;
  supportNeedId: string;
  campaignId: string;
  user: ICharityUserBrief;
  quantity: number;
  completedQuantity: number | null;
  note: string | null;
  status: CharitySupportOfferStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionReason: string | null;
  createdAt: Date;
}

// ── Đợt trao (§3.18) ────────────────────────────────────────────────────────

export interface ICharityRoundInput {
  title: string;
  locationLabel: string | null;
  address: string | null;
  startsAt: Date;
  endsAt: Date;
}

export interface ICharityRoundStats {
  /** Participant còn hiệu lực gắn với đợt. */
  participantCount: number;
  /** Đã check-in / hoàn thành. */
  attendedCount: number;
  deliveryCount: number;
  completedDeliveryCount: number;
  /** Tổng giá trị ban tổ chức xác nhận của các lượt giao nhận đã hoàn tất (VNĐ). */
  confirmedValue: number;
}

export interface ICharityRound extends ICharityRoundInput {
  roundId: string;
  campaignId: string;
  status: CharityRoundStatus;
  statusReason: string | null;
  readiness: CharityRoundReadiness;
  readinessNote: string | null;
  readinessBy: string | null;
  readinessAt: Date | null;
  checklist: ICharityRoundChecklistItem[];
  stats: ICharityRoundStats;
  updatedAt: Date;
}

export interface ICharityRoundPreEventCandidate {
  campaignId: string;
  roundId: string;
  title: string;
  startsAt: Date;
}

// ── Tranh chấp đóng góp (§3.18) ─────────────────────────────────────────────

/** Hai bên của một đóng góp — để biết ai được mở / giải quyết tranh chấp. */
export interface ICharityContributionParties {
  contributionId: string;
  campaignId: string;
  campaignTitle: string;
  campaignCreatedBy: string;
  contributorId: string;
  status: string;
}

export interface ICharityDispute {
  disputeId: string;
  campaignId: string;
  contributionId: string;
  contributorId: string;
  openedBy: string;
  openedByParty: CharityDisputeParty;
  reason: CharityDisputeReason;
  description: string;
  evidenceUrls: string[];
  status: CharityDisputeStatus;
  resolution: string | null;
  closedBy: string | null;
  closedAt: Date | null;
  createdAt: Date;
}

export interface ICharityOperationsRepository {
  // Hỗ trợ mở
  listSupportNeeds(campaignId: string): Promise<ICharitySupportNeed[]>;
  findSupportNeed(
    campaignId: string,
    supportNeedId: string,
  ): Promise<ICharitySupportNeed | null>;
  createSupportNeed(params: {
    campaignId: string;
    actorId: string;
    need: ICharitySupportNeedInput;
  }): Promise<ICharitySupportNeed>;
  updateSupportNeed(params: {
    campaignId: string;
    supportNeedId: string;
    actorId: string;
    need: ICharitySupportNeedInput;
    external: ICharitySupportNeedExternal;
    status: 'OPEN' | 'CLOSED';
  }): Promise<ICharitySupportNeed | null>;
  /** Xoá chỉ khi chưa ai nhận hỗ trợ — có rồi thì đóng (§3.18). */
  deleteSupportNeed(
    campaignId: string,
    supportNeedId: string,
  ): Promise<'DELETED' | 'NOT_FOUND' | 'HAS_OFFERS'>;
  createOffer(params: {
    supportNeedId: string;
    userId: string;
    quantity: number;
    note: string | null;
  }): Promise<ICharitySupportOffer>;
  listOffers(params: {
    campaignId: string;
    supportNeedId: string | null;
    userId: string | null;
  }): Promise<ICharitySupportOffer[]>;
  findOffer(
    campaignId: string,
    offerId: string,
  ): Promise<ICharitySupportOffer | null>;
  /** Đổi trạng thái CÓ ĐIỀU KIỆN (`from`) — bấm cùng lúc thì một người thắng. */
  transitionOffer(params: {
    campaignId: string;
    offerId: string;
    from: readonly CharitySupportOfferStatus[];
    to: CharitySupportOfferStatus;
    actorId: string | null;
    reason: string | null;
    completedQuantity: number | null;
  }): Promise<ICharitySupportOffer | null>;

  // Đợt trao
  listRounds(campaignId: string): Promise<ICharityRound[]>;
  findRound(campaignId: string, roundId: string): Promise<ICharityRound | null>;
  /** Tạo đợt kèm 10 bước timeline riêng của đợt. */
  createRound(params: {
    campaignId: string;
    actorId: string;
    round: ICharityRoundInput;
  }): Promise<ICharityRound>;
  /**
   * Sửa đợt. Đổi giờ / địa điểm của dự án đã duyệt thì xếp thông báo `ROUND_CHANGED` cho người
   * bị ảnh hưởng (cùng transaction), kèm lý do.
   */
  updateRound(params: {
    campaignId: string;
    roundId: string;
    actorId: string;
    round: ICharityRoundInput;
    reason: string | null;
    announce: boolean;
  }): Promise<ICharityRound | null>;
  /** PLANNED → DONE / CANCELLED (có lý do) — xếp `ROUND_CHANGED` khi huỷ. */
  setRoundStatus(params: {
    campaignId: string;
    roundId: string;
    actorId: string;
    status: 'DONE' | 'CANCELLED';
    reason: string | null;
  }): Promise<ICharityRound | null>;
  setRoundReadiness(params: {
    campaignId: string;
    roundId: string;
    actorId: string;
    readiness: CharityRoundReadiness;
    note: string | null;
    checklist: ICharityRoundChecklistItem[];
  }): Promise<ICharityRound | null>;
  /**
   * Gắn participant / lượt giao nhận vào đợt (`roundId` null = gỡ khỏi đợt). Chỉ dòng của chính
   * dự án; trả số dòng đã gắn.
   */
  assignToRound(params: {
    campaignId: string;
    roundId: string | null;
    participationIds: string[];
    deliveryIds: string[];
  }): Promise<{ participations: number; deliveries: number }>;
  listRoundPreEventCandidates(params: {
    hours: number;
    limit: number;
  }): Promise<ICharityRoundPreEventCandidate[]>;
  /** Có đợt trao nào chưa — có thì nhắc 48 giờ theo đợt, không theo bước trao chung. */
  hasRounds(campaignId: string): Promise<boolean>;

  // Tranh chấp đóng góp
  findContributionParties(
    contributionId: string,
  ): Promise<ICharityContributionParties | null>;
  /** `ALREADY_OPEN` khi đóng góp đã có tranh chấp đang mở (index duy nhất một phần). */
  openDispute(params: {
    campaignId: string;
    contributionId: string;
    openedBy: string;
    party: CharityDisputeParty;
    reason: CharityDisputeReason;
    description: string;
    evidenceUrls: string[];
  }): Promise<ICharityDispute | 'ALREADY_OPEN'>;
  findDispute(disputeId: string): Promise<ICharityDispute | null>;
  listDisputes(params: {
    campaignId: string | null;
    contributionId: string | null;
    status: CharityDisputeStatus | null;
  }): Promise<ICharityDispute[]>;
  /** OPEN → RESOLVED / WITHDRAWN có điều kiện; `null` khi đã có người đóng trước. */
  closeDispute(params: {
    disputeId: string;
    to: 'RESOLVED' | 'WITHDRAWN';
    actorId: string;
    resolution: string | null;
  }): Promise<ICharityDispute | null>;

  // Hoàn tất dự án
  completionBlockers(campaignId: string): Promise<CharityCompletionBlocker[]>;
}
export const ICharityOperationsRepository = Symbol(
  'ICharityOperationsRepository',
);
