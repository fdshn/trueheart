import {
  AffiliateEventType,
  AffiliateGeoStatus,
  AffiliateLocationSource,
  AffiliateRewardStatus,
  IAffiliatePolicy,
} from '@chantam.vn/chantam.core-lib/models';
import { IGeoPoint } from '@chantam/service.persistency-lib/geo';
import { EntityManager } from 'typeorm';

export interface IAffiliatePolicyRevision {
  readonly version: number;
  readonly policy: IAffiliatePolicy;
  readonly effectiveAt: Date;
  readonly reason: string;
  readonly createdBy: string | null;
  readonly createdAt: Date;
}

export interface IPublishAffiliatePolicyParams {
  readonly actorUserId: string;
  readonly expectedVersion: number | null;
  readonly policy: IAffiliatePolicy;
  readonly effectiveAt: Date;
  readonly reason: string;
}

export interface IRecordAffiliateEventParams {
  readonly eventType: AffiliateEventType;
  /** Thành viên có hành động sinh ra sự kiện. */
  readonly sourceUserId: string;
  readonly referenceType: string;
  readonly referenceId: string;
  /**
   * Các toạ độ ứng viên, xét theo thứ tự ưu tiên của BR-GEO-AFF-02.
   *
   * Nơi gọi truyền những gì mình có; `resolveAffiliateLocation` chọn. Không nơi nào
   * được tự chọn trước rồi truyền một toạ độ duy nhất — làm vậy là nhân bản luật ưu
   * tiên ra từng chỗ gọi, và chỗ nào quên một bậc thì lệch âm thầm.
   */
  readonly eventLocation?: IGeoPoint | null;
  readonly transactionLocation?: IGeoPoint | null;
  readonly postLocation?: IGeoPoint | null;
}

export interface IAffiliateEventOutcome {
  readonly eventId: string;
  readonly groupId: string;
  readonly geoStatus: AffiliateGeoStatus;
  readonly locationSource: AffiliateLocationSource;
  readonly distanceMeters: number | null;
  readonly radiusMeters: number | null;
  readonly beneficiaryCount: number;
  readonly totalPoints: number;
  readonly cappedCount: number;
}

export interface IAffiliateEventRow {
  readonly globalId: string;
  readonly groupId: string;
  readonly sourceUserId: string;
  readonly eventType: string;
  readonly referenceType: string;
  readonly referenceId: string;
  readonly geoStatus: AffiliateGeoStatus;
  readonly locationSource: AffiliateLocationSource;
  readonly distanceMeters: number | null;
  readonly radiusMeters: number | null;
  readonly beneficiaryCount: number;
  readonly totalPoints: number;
  readonly policyVersion: number;
  readonly createdAt: Date;
}

export interface IAffiliateRewardRow {
  readonly beneficiaryUserId: string;
  readonly rewardStatus: AffiliateRewardStatus;
  readonly pointDelta: number;
  readonly pointLedgerId: number | null;
  readonly reversedAt: Date | null;
}

export interface IReverseAffiliateEventResult {
  readonly reversedCount: number;
  readonly pointsReclaimed: number;
}

export interface IAffiliateRepository {
  getActivePolicy(): Promise<IAffiliatePolicyRevision | null>;
  listPolicyHistory(limit: number): Promise<IAffiliatePolicyRevision[]>;
  publishPolicy(
    params: IPublishAffiliatePolicyParams,
  ): Promise<IAffiliatePolicyRevision>;

  /**
   * Ghi nhận một sự kiện gốc và phát thưởng cho Active Member của nhóm (F56-F58).
   *
   * Nhận `manager` để chạy TRONG transaction của đường nghiệp vụ đã mở: thưởng ngoài
   * transaction đó thì một lượt trao commit xong mà reward chưa ghi là mất vĩnh viễn.
   * Cùng lý do đã chọn cho tiến độ lượt bù của F83.
   *
   * **Không ném khi chưa bật.** Trả `null` và không ghi gì: tính năng tắt là trạng
   * thái bình thường, và để nó ném thì mọi đường nghiệp vụ gọi tới đây — đăng bài,
   * hoàn tất lượt trao — sẽ chết theo.
   *
   * Người gọi KHÔNG truyền số điểm. BR-AFF-03 nói thẳng *"client không được tự khai
   * point_delta"*, và ở đây còn mạnh hơn: không tầng nào ngoài repository này biết
   * cách tính, nên không có chỗ nào để khai sai.
   */
  recordEvent(
    manager: EntityManager,
    params: IRecordAffiliateEventParams,
  ): Promise<IAffiliateEventOutcome | null>;

  listEvents(query: {
    groupId?: string;
    geoStatus?: AffiliateGeoStatus;
    skip: number;
    take: number;
  }): Promise<{ items: IAffiliateEventRow[]; total: number }>;

  listRewards(eventGlobalId: string): Promise<IAffiliateRewardRow[]>;

  /**
   * Thu hồi toàn bộ reward của một sự kiện (BR-AFF-04, câu A5).
   *
   * **Ghi thêm bút toán đảo, không xoá lịch sử** — đúng nguyên văn quy tắc. Dòng
   * reward đổi sang `REVERSED` và `point_delta` về 0, còn dấu vết nằm ở `point_ledger`:
   * cả bút toán gốc và bút toán đảo đều ở đó.
   */
  reverseEvent(params: {
    eventGlobalId: string;
    actorUserId: string;
    reason: string;
  }): Promise<IReverseAffiliateEventResult>;
}

export const IAffiliateRepository = Symbol('IAffiliateRepository');
