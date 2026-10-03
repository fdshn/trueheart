import {
  CharityApprovalStatus,
  CharityParticipationStatus,
  CharityReviewRole,
} from '@chantam.vn/chantam.core-lib/models';

/** Lọc theo pha thời gian trên đường công khai. */
export const CharityCampaignPhases = ['UPCOMING', 'ONGOING', 'ENDED'] as const;

export type CharityCampaignPhase = (typeof CharityCampaignPhases)[number];

export interface ICharityCampaign {
  readonly globalId: string;
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly bannerUrl: string;
  readonly badgeName: string;
  readonly targetItemsCount: number;
  /**
   * Số phần quà người tổ chức KHAI đã trao.
   *
   * BR-CHARITY-02: hệ thống không đối soát. Không trigger, không hook nào tăng cột này —
   * chỉ `updateProgress` do người tổ chức hoặc Admin gọi.
   */
  readonly currentItemsCount: number;
  /** `null` khi `targetItemsCount = 0`, tức người tổ chức không đặt mục tiêu số lượng. */
  readonly progressPercent: number | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly locationLabel: string | null;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly isActive: boolean;
  readonly approvalStatus: CharityApprovalStatus;
  readonly approvalNote: string | null;
  readonly approvedAt: Date | null;
  readonly approvedBy: string | null;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /**
   * Số người đang đăng ký — ĐẾM LÚC ĐỌC, không phải cột lưu sẵn.
   *
   * Xem docblock migration `1798200000000`: mọi cột đếm lưu sẵn trong hệ này đã từng lệch.
   */
  readonly participantCount: number;
}

export interface ICharityReview {
  readonly globalId: string;
  readonly campaignId: string;
  readonly reviewerId: string;
  readonly revieweeId: string;
  readonly reviewerRole: CharityReviewRole;
  readonly rating: number;
  readonly comment: string | null;
  readonly createdAt: Date;
}

export interface ICreateCharityCampaignParams {
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly bannerUrl: string;
  readonly badgeName: string;
  readonly targetItemsCount: number;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly locationLabel: string | null;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly createdBy: string;
  /** Admin tạo thì `APPROVED` ngay; thành viên tạo thì `PENDING_APPROVAL` (BR-CHARITY-01). */
  readonly approvalStatus: CharityApprovalStatus;
  /** Người duyệt — chính người tạo khi Admin tạo trực tiếp, `null` khi còn chờ duyệt. */
  readonly approvedBy: string | null;
}

export interface ICharityCampaignPage {
  readonly items: ICharityCampaign[];
  readonly total: number;
}

export interface ICharityCampaignRepository {
  create(params: ICreateCharityCampaignParams): Promise<ICharityCampaign>;

  slugTaken(slug: string): Promise<boolean>;

  /** Bất kể trạng thái duyệt — dùng cho mọi lượt kiểm quyền trước khi ghi. */
  findByGlobalId(globalId: string): Promise<ICharityCampaign | null>;

  /**
   * Đường công khai, nhận cả id lẫn slug.
   *
   * CHỈ trả hoạt động đã duyệt, còn bật, chưa xoá — kể cả khi tra bằng id. Một hồ sơ chờ
   * duyệt đọc được bằng id là nội dung chưa kiểm lọt ra ngoài.
   */
  findPublicByIdOrSlug(idOrSlug: string): Promise<ICharityCampaign | null>;

  listPublic(query: {
    readonly limit: number;
    readonly offset: number;
    readonly phase?: CharityCampaignPhase;
  }): Promise<ICharityCampaignPage>;

  listForAdmin(query: {
    readonly limit: number;
    readonly offset: number;
    readonly approvalStatus?: CharityApprovalStatus;
  }): Promise<ICharityCampaignPage>;

  /**
   * Hoạt động NGƯỜI ĐÓ đã đăng ký và chưa huỷ.
   *
   * Không lọc theo `approval_status`: một hoạt động bị Admin tắt sau khi đã có người
   * đăng ký vẫn phải hiện trong danh sách của họ, nếu không thì lịch của họ biến mất
   * mà không ai nói gì.
   */
  listJoinedByUser(query: {
    readonly userId: string;
    readonly limit: number;
    readonly offset: number;
  }): Promise<ICharityCampaignPage>;

  listByCreator(query: {
    readonly userId: string;
    readonly limit: number;
    readonly offset: number;
  }): Promise<ICharityCampaignPage>;

  /**
   * Duyệt hoặc từ chối.
   *
   * Chỉ đổi khi hồ sơ còn `PENDING_APPROVAL` — trả `null` nếu đã có người xử lý. Lượt kiểm
   * đó nằm trong `WHERE` của chính câu `UPDATE`, không phải một lượt đọc trước đó: hai
   * Admin bấm cùng lúc thì người sau phải thấy xung đột, không phải ghi đè quyết định
   * người trước.
   */
  decideApproval(params: {
    readonly campaignId: string;
    readonly approverId: string;
    readonly approve: boolean;
    readonly note: string | null;
  }): Promise<ICharityCampaign | null>;

  /** Cập nhật con số LỜI KHAI. Xem `currentItemsCount`. */
  updateProgress(params: {
    readonly campaignId: string;
    readonly currentItemsCount: number;
  }): Promise<ICharityCampaign | null>;

  setActive(params: {
    readonly campaignId: string;
    readonly isActive: boolean;
  }): Promise<ICharityCampaign | null>;

  /**
   * Đăng ký tham gia.
   *
   * `created: false` khi người đó đã đăng ký và vẫn đang `REGISTERED` — bên gọi đổi nó
   * thành 409 thay vì im lặng coi như thành công. Một hàng `CANCELLED` thì được hồi lại
   * `REGISTERED`, vì `UQ_campaign_participations_member` chỉ cho mỗi người một hàng.
   */
  register(params: {
    readonly campaignId: string;
    readonly userId: string;
  }): Promise<{ readonly created: boolean }>;

  /** `false` khi người đó không có hàng `REGISTERED` nào để huỷ. */
  cancelParticipation(params: {
    readonly campaignId: string;
    readonly userId: string;
  }): Promise<boolean>;

  findParticipationStatus(params: {
    readonly campaignId: string;
    readonly userId: string;
  }): Promise<CharityParticipationStatus | null>;

  /** Những người đang `REGISTERED` — dùng để xác định vai khi viết đánh giá. */
  listRegisteredUserIds(campaignId: string): Promise<string[]>;

  createReview(params: {
    readonly campaignId: string;
    readonly reviewerId: string;
    readonly revieweeId: string;
    readonly reviewerRole: CharityReviewRole;
    readonly rating: number;
    readonly comment: string | null;
  }): Promise<ICharityReview>;

  reviewExists(params: {
    readonly campaignId: string;
    readonly reviewerId: string;
    readonly revieweeId: string;
  }): Promise<boolean>;

  listReviews(query: {
    readonly campaignId: string;
    readonly limit: number;
    readonly offset: number;
  }): Promise<{ readonly items: ICharityReview[]; readonly total: number }>;
}

export const ICharityCampaignRepository = Symbol('ICharityCampaignRepository');
