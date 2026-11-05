import {
  CharityAppealOutcome,
  CharityAppealStatus,
  CharityAppealTargetType,
  CharityPointRuleCode,
} from '@chantam.vn/chantam.core-lib/models';

/** Dự án từ thiện — đợt 4b (CHARITY-PROJECT-LIFECYCLE §3.9, §3.16). */

export interface ICharityPointRule {
  points: number;
  isEnabled: boolean;
}

export interface ICharityPointAward {
  awardId: string;
  campaignId: string;
  userId: string;
  ruleCode: CharityPointRuleCode;
  referenceType: string;
  referenceId: string;
  targetPoints: number;
  appliedPoints: number;
  reason: string;
  updatedAt: Date;
}

/** Trần của một rule — `null` = không trần. */
export interface ICharityPointCaps {
  daily: number | null;
  project: number | null;
  cycle: number | null;
}

export interface ICharitySettleResult {
  /** Bút toán vừa ghi (âm khi giảm). 0 khi không có gì để ghi hoặc vướng trần. */
  applied: number;
  /** Còn chờ vì trần. */
  deferred: number;
}

export interface ICharityDeliveryValue {
  deliveryId: string;
  campaignId: string;
  contributorId: string;
  completedBy: string | null;
  completedAt: Date;
  /** `confirmed_value_adjusted` nếu đã điều chỉnh, không thì tổng giá trị các dòng. */
  confirmedValue: number;
}

export interface ICharityPointsRepository {
  findRule(code: CharityPointRuleCode): Promise<ICharityPointRule | null>;
  /** Đặt "nên được bao nhiêu" cho (rule, đối tượng, người) — tạo hoặc cập nhật. */
  upsertAward(params: {
    campaignId: string;
    userId: string;
    ruleCode: CharityPointRuleCode;
    referenceType: string;
    referenceId: string;
    targetPoints: number;
    reason: string;
  }): Promise<ICharityPointAward>;
  findAwards(params: {
    ruleCode?: CharityPointRuleCode;
    referenceType: string;
    referenceId: string;
  }): Promise<ICharityPointAward[]>;
  /**
   * Ghi phần chênh `target − applied` vào sổ điểm, dưới khoá (người + rule). Dương: theo
   * trần; phần vướng trần để chờ. Âm: ghi ngay. Idempotent theo (award, lượt).
   */
  settle(params: {
    awardId: string;
    caps: ICharityPointCaps;
    dayStart: Date;
  }): Promise<ICharitySettleResult>;
  /** Award còn chênh (đang hoãn hoặc chưa ghi). */
  listUnsettled(limit: number): Promise<ICharityPointAward[]>;
  deliveryValue(deliveryId: string): Promise<ICharityDeliveryValue | null>;
  /**
   * Lượt giao nhận đã hoàn tất trong `days` ngày mà chưa có award `CHARITY_ITEM_VALUE` — vá
   * khoảng hở giữa commit lượt giao nhận và lượt ghi award.
   */
  listDeliveriesWithoutAward(days: number, limit: number): Promise<string[]>;
  /**
   * Bài ảnh/clip đã bị gỡ hoặc Admin ẩn mà award còn > 0: đưa về 0 (job sẽ ghi bút toán trừ).
   * Trả số award vừa đổi.
   */
  zeroAwardsForRemovedPosts(limit: number): Promise<number>;
  setDeliveryAdjustedValue(params: {
    deliveryId: string;
    value: number;
  }): Promise<void>;
}

export const ICharityPointsRepository = Symbol('ICharityPointsRepository');

export interface ICharityAppeal {
  appealId: string;
  campaignId: string;
  campaignTitle: string;
  appellantId: string;
  appellantUsername: string | null;
  targetType: CharityAppealTargetType;
  targetId: string;
  originalValue: number;
  requestedValue: number | null;
  description: string;
  evidenceUrls: string[];
  status: CharityAppealStatus;
  tier: 1 | 2;
  organizerDecision: 'ADJUST' | 'KEEP' | null;
  organizerValue: number | null;
  organizerReason: string | null;
  organizerDecidedAt: Date | null;
  adminDecision: 'ADJUST' | 'KEEP' | 'REJECT' | null;
  adminValue: number | null;
  adminReason: string | null;
  adminDecidedAt: Date | null;
  outcome: CharityAppealOutcome | null;
  organizerDueAt: Date;
  appellantDueAt: Date | null;
  createdAt: Date;
  closedAt: Date | null;
}

export interface ICharityAppealEvent {
  actorId: string | null;
  action: string;
  fromStatus: CharityAppealStatus | null;
  toStatus: CharityAppealStatus;
  value: number | null;
  reason: string | null;
  createdAt: Date;
}

/** Số liệu cho Admin (§3.16 mục 7) — chỉ để thấy, không tự động phạt. */
export interface ICharityAppealAdminView extends ICharityAppeal {
  appellantRejectedCount: number;
  organizerOverturnedCount: number;
}

export interface ICharityAppealTransition {
  appealId: string;
  expected: CharityAppealStatus;
  next: CharityAppealStatus;
  action: string;
  actorId: string | null;
  value: number | null;
  reason: string | null;
  tier?: 1 | 2;
  organizerDecision?: 'ADJUST' | 'KEEP';
  adminDecision?: 'ADJUST' | 'KEEP' | 'REJECT';
  outcome?: CharityAppealOutcome | null;
  appellantDueAt?: Date | null;
}

export interface ICharityEvaluationTarget {
  evaluationId: string;
  campaignId: string;
  participantId: string;
  completionScore: number;
  evaluatedBy: string | null;
  createdAt: Date;
  isLatest: boolean;
}

export interface ICharityAppealRepository {
  create(params: {
    campaignId: string;
    appellantId: string;
    targetType: CharityAppealTargetType;
    targetId: string;
    originalValue: number;
    requestedValue: number | null;
    description: string;
    evidenceUrls: string[];
    organizerDueAt: Date;
  }): Promise<ICharityAppeal | 'DUPLICATED'>;
  find(appealId: string): Promise<ICharityAppeal | null>;
  listEvents(appealId: string): Promise<ICharityAppealEvent[]>;
  listByCampaign(campaignId: string): Promise<ICharityAppeal[]>;
  listByAppellant(userId: string): Promise<ICharityAppeal[]>;
  listForAdmin(params: {
    status: CharityAppealStatus | null;
    limit: number;
    offset: number;
  }): Promise<ICharityAppealAdminView[]>;
  countSince(appellantId: string, since: Date): Promise<number>;
  /** Có điều kiện trạng thái — `null` khi đã có người đổi trước (STALE). Ghi sự kiện cùng transaction. */
  transition(params: ICharityAppealTransition): Promise<ICharityAppeal | null>;
  listOverdue(now: Date, limit: number): Promise<ICharityAppeal[]>;
  findEvaluationTarget(
    evaluationId: string,
  ): Promise<ICharityEvaluationTarget | null>;
  /** Người vận hành dự án (người tạo + coordinator) khác `exceptUserId`. */
  countOtherOperators(
    campaignId: string,
    exceptUserId: string,
  ): Promise<number>;
}

export const ICharityAppealRepository = Symbol('ICharityAppealRepository');
