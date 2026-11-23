import {
  CharityChangeRequestStatus,
  ICharityReviewedFields,
} from '@chantam.vn/chantam.core-lib/models';
import { EntityManager } from 'typeorm';
import { ICharityCampaignMediaParams } from './charity-campaign.repository';
import { ICharityPartyInput } from './charity-project.repository';

/** Bản sửa chờ duyệt của một chiến dịch đã duyệt (CR 22/11/2026). */
export interface ICharityChangeRequest {
  requestId: string;
  campaignId: string;
  status: CharityChangeRequestStatus;
  proposed: ICharityReviewedFields;
  base: ICharityReviewedFields;
  submittedBy: string | null;
  submittedAt: Date;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionReason: string | null;
}

export interface ICharityChangeRequestRepository {
  findPending(campaignId: string): Promise<ICharityChangeRequest | null>;
  /**
   * Tạo bản `PENDING`, hoặc thay nội dung bản đang chờ (`base` giữ từ lần gửi đầu — Admin so
   * với đúng bản đã duyệt lúc chủ dự án bắt đầu sửa).
   */
  upsertPending(params: {
    campaignId: string;
    actorId: string;
    proposed: ICharityReviewedFields;
    base: ICharityReviewedFields;
  }): Promise<ICharityChangeRequest>;
  /** `false` khi không có bản nào đang chờ. */
  withdraw(params: { campaignId: string; actorId: string }): Promise<boolean>;
  listByStatus(params: {
    status: CharityChangeRequestStatus | null;
    limit: number;
    offset: number;
  }): Promise<ICharityChangeRequest[]>;
  /** Có điều kiện `PENDING`; `null` khi đã có người quyết trước. */
  decide(params: {
    requestId: string;
    actorId: string;
    status: 'APPROVED' | 'REJECTED';
    reason: string | null;
    manager?: EntityManager;
  }): Promise<ICharityChangeRequest | null>;
  /**
   * Áp bản sửa đã duyệt trong MỘT transaction: cập nhật chiến dịch, thay media, thay bộ đơn vị
   * nhận, ghi lịch sử sửa (một thông báo `PLAN_CHANGED` nếu có thay đổi quan trọng) và chốt
   * bản sửa `APPROVED`. Bản sửa không còn `PENDING` → `null`, không áp gì.
   */
  applyApproved(params: {
    request: ICharityChangeRequest;
    actorId: string;
    reason: string | null;
    campaign: {
      title?: string;
      description?: string;
      pointBonusPercent?: number;
      acceptedContributionTypes?: readonly string[];
    };
    media: {
      media: readonly ICharityCampaignMediaParams[];
      bannerUrl: string;
    } | null;
    /** Bộ party THAY THẾ (mọi vai, trừ người thụ hưởng của kêu gọi cá nhân); `null` = giữ nguyên. */
    parties: ICharityPartyInput[] | null;
  }): Promise<ICharityChangeRequest | null>;
}

export const ICharityChangeRequestRepository = Symbol(
  'ICharityChangeRequestRepository',
);
