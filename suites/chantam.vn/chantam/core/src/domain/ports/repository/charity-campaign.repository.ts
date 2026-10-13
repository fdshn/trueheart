import {
  CharityApprovalStatus,
  CharityBeneficiaryRelation,
  CharityCampaignType,
  CharityContributionStatus,
  CharityMediaType,
  CharityParticipationStatus,
  CharityRejectionReason,
  CharityReviewRole,
} from '@chantam.vn/chantam.core-lib/models';

/** Lọc theo pha thời gian trên đường công khai. */
export const CharityCampaignPhases = ['UPCOMING', 'ONGOING', 'ENDED'] as const;

export type CharityCampaignPhase = (typeof CharityCampaignPhases)[number];

/** Một ảnh/video của hoạt động như API trả ra. Không lộ storage key. */
export interface ICharityCampaignMedia {
  readonly url: string;
  readonly type: CharityMediaType;
  readonly sortOrder: number;
  readonly isCover: boolean;
}

/** Một dòng `campaign_media` sẵn sàng ghi — đã qua HeadObject và luật bộ media. */
export interface ICharityCampaignMediaParams {
  readonly storageKey: string;
  readonly publicUrl: string;
  readonly mediaType: CharityMediaType;
  readonly sortOrder: number;
  readonly isCover: boolean;
}

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
  /**
   * Ảnh/video theo thứ tự hiển thị. Rỗng với hoạt động tạo trước khi có media —
   * những hoạt động đó vẫn có `bannerUrl` cũ.
   */
  readonly media: readonly ICharityCampaignMedia[];
  readonly campaignType: CharityCampaignType;
  /** Chỉ `INDIVIDUAL_APPEAL` có; database canh bằng CHECK nối hai cột. */
  readonly beneficiaryRelation: CharityBeneficiaryRelation | null;
  /** Lượt chấp nhận đề nghị được vượt mục tiêu từng dòng (§5). Mặc định `false`. */
  readonly allowOverTarget: boolean;
}

/**
 * Một dòng nhu cầu vật phẩm, kèm projection tiến độ (F65b §3).
 *
 * `unit` không bao giờ bị cộng chéo giữa hai dòng: `kg + cái + hộp` là con số
 * không có nghĩa. Mỗi dòng tự kể tiến độ của nó.
 */
export interface ICharityNeedItem {
  readonly globalId: string;
  readonly categoryId: string | null;
  readonly itemName: string;
  readonly description: string | null;
  readonly unit: string;
  readonly targetQuantity: number;
  readonly allowAlternative: boolean;
  /** Đã chấp nhận nhưng transaction chưa xong. Projection do hệ thống ghi. */
  readonly acceptedQuantity: number;
  /** Thực nhận từ transaction hoàn tất và đóng góp ngoài app còn hiệu lực. */
  readonly receivedQuantity: number;
  readonly remainingQuantity: number;
  /**
   * Tổng số lượng trên các đề nghị đang chờ xét (§3).
   *
   * **KHÔNG giữ chỗ** và không trừ khỏi `remainingQuantity` — nó chỉ nói cho
   * organizer biết tải điều phối. Giữ chỗ theo đề nghị thì một loạt đề nghị không
   * thực hiện sẽ làm chiến dịch trông như đã đủ và chặn người tặng thật.
   *
   * Vì thế nó cũng KHÔNG có cột: đếm lúc đọc từ `campaign_contribution_items` của
   * những đề nghị `PENDING_REVIEW`. Một con số lưu sẵn mà không ai được dựa vào là
   * mời người sau dựa vào nó.
   */
  readonly pendingQuantity: number;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

export interface ICreateCharityNeedItemParams {
  readonly categoryId: string | null;
  readonly itemName: string;
  readonly description: string | null;
  readonly unit: string;
  readonly targetQuantity: number;
  readonly allowAlternative: boolean;
  readonly sortOrder: number;
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
  readonly campaignType: CharityCampaignType;
  readonly beneficiaryRelation: CharityBeneficiaryRelation | null;
  readonly allowOverTarget: boolean;
  /** Người thụ hưởng, ghi cùng transaction. Chỉ có ở kêu gọi cho NGƯỜI KHÁC. */
  readonly beneficiary: ICharityBeneficiaryInput | null;
  /**
   * Bảng nhu cầu, ghi TRONG CÙNG transaction với hoạt động (F65b §3).
   *
   * Hai lượt ghi rời sẽ để lại một hoạt động công khai không có dòng nhu cầu nào
   * nếu lượt thứ hai hỏng — và với `PUBLISH_CHARITY_WITHOUT_REVIEW` thì nó công
   * khai ngay, nên người dùng thấy một kêu gọi không nói cần gì.
   *
   * Rỗng là hợp lệ: hoạt động chỉ nhận đăng ký tham dự thì không có bảng nhu cầu,
   * và §10 nói giữ nguyên hành vi legacy cho những hoạt động đó.
   */
  readonly needs: readonly ICreateCharityNeedItemParams[];
  /** Ghi TRONG CÙNG transaction với hoạt động — hồ sơ vào hàng chờ duyệt luôn đủ ảnh. */
  readonly media: readonly ICharityCampaignMediaParams[];
}

export interface ICharityContributionItem {
  readonly globalId: string;
  readonly needItemId: string;
  /** Tên và đơn vị của dòng nhu cầu, để nơi gọi khỏi đi một lượt đọc nữa. */
  readonly itemName: string;
  readonly unit: string;
  readonly offeredQuantity: number;
  readonly conditionNote: string | null;
  /** `null` khi organizer chưa quyết dòng này — KHÁC `0` là đã xem và không nhận. */
  readonly acceptedQuantity: number | null;
  readonly rejectionReason: CharityRejectionReason | null;
}

export interface ICharityContribution {
  readonly globalId: string;
  readonly campaignId: string;
  readonly contributorId: string;
  readonly status: CharityContributionStatus;
  readonly note: string | null;
  /**
   * Cách liên lạc contributor tự khai cho lượt giao nhận này.
   *
   * KHÔNG ra response công khai: §9 nói response public không trả contact. Chỉ
   * organizer/coordinator của chiến dịch và chính contributor đọc được.
   */
  readonly contactNote: string | null;
  readonly decidedAt: Date | null;
  readonly createdAt: Date;
  readonly items: readonly ICharityContributionItem[];
  /**
   * Lượt giao nhận sinh từ đề nghị này, `null` khi chưa quyết hoặc bị từ chối hết.
   *
   * Tối đa MỘT — `UQ_campaign_deliveries_contribution` giữ điều đó ở database.
   */
  readonly deliveryId: string | null;
  readonly deliveryStatus: CharityDeliveryStatus | null;
}

export type CharityDeliveryStatus = 'ACCEPTED' | 'COMPLETED' | 'CANCELLED';

export interface ICharityDeliveryItem {
  readonly needItemId: string;
  readonly itemName: string;
  readonly unit: string;
  readonly acceptedQuantity: number;
  /** `null` khi chưa xác nhận — KHÁC `0` là đã xác nhận và không nhận được gì. */
  readonly receivedQuantity: number | null;
}

/**
 * Một lượt giao nhận từ thiện (F65b §6).
 *
 * Bảng RIÊNG, không phải `gift_transactions` — xem docblock migration
 * `1800000000000-CreateCharityDeliveries` để biết vì sao.
 */
export interface ICharityDelivery {
  readonly globalId: string;
  readonly campaignId: string;
  readonly contributionId: string;
  readonly contributorId: string;
  /** Người tổ chức tại lúc quyết định — người NHẬN của lượt giao này. */
  readonly organizerId: string;
  readonly status: CharityDeliveryStatus;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancelReason: string | null;
  readonly items: readonly ICharityDeliveryItem[];
}

export interface IDecideContributionResult {
  readonly contribution: ICharityContribution;
  /** `null` khi từ chối mọi dòng — không sinh lượt giao nhận rác (§6). */
  readonly delivery: ICharityDelivery | null;
  /**
   * `true` khi đây là lượt RETRY cùng khoá: không ghi gì, chỉ trả lại kết quả cũ.
   * Nơi gọi dùng nó để không gửi thông báo lần hai.
   */
  readonly replayed: boolean;
}

export interface ICreateCharityContributionItemParams {
  readonly needItemId: string;
  readonly offeredQuantity: number;
  readonly conditionNote: string | null;
}

export interface ICreateCharityContributionParams {
  readonly campaignId: string;
  readonly contributorId: string;
  readonly note: string | null;
  readonly contactNote: string | null;
  readonly items: readonly ICreateCharityContributionItemParams[];
}

export interface ICharityContributionPage {
  readonly items: readonly ICharityContribution[];
  readonly total: number;
}

/**
 * Một bản ghi đóng góp NGOÀI APP (F65b §7).
 *
 * Không có trường người tặng, và đó là chủ ý: không có đường nào gắn bản ghi này vào
 * một tài khoản để cộng điểm (tiêu chí §11.10). `sourceLabel` là nhãn chữ.
 */
export interface ICharityExternalContribution {
  readonly globalId: string;
  readonly campaignId: string;
  readonly needItemId: string;
  readonly itemName: string;
  readonly unit: string;
  readonly quantity: number;
  readonly sourceLabel: string;
  readonly receivedAt: Date;
  readonly evidenceNote: string | null;
  readonly recordedBy: string;
  readonly status: 'ACTIVE' | 'VOIDED';
  /** Bản ghi mà bản này THAY THẾ, khi đây là một lượt điều chỉnh. */
  readonly replacesId: string | null;
  readonly voidedAt: Date | null;
  readonly voidReason: string | null;
  readonly createdAt: Date;
}

export interface ICloseCampaignResult {
  readonly campaignId: string;
  /** Số đề nghị đang chờ bị từ chối với lý do `CAMPAIGN_CLOSED` (§8). */
  readonly rejectedContributions: number;
  /** Ai bị từ chối — để báo cho từng người. Một lý do họ không gây ra vẫn phải được nói. */
  readonly rejected: readonly {
    contributionId: string;
    contributorId: string;
  }[];
  /** Lượt giao nhận còn đang chạy — KHÔNG bị huỷ, vẫn hoàn tất được (§8, §11.5). */
  readonly openDeliveries: number;
}

/**
 * Người thụ hưởng của một kêu gọi cho NGƯỜI KHÁC (§2). RIÊNG TƯ: chỉ người tổ chức và
 * Admin có `campaign.manage` đọc được, và không DTO công khai nào mang nó.
 */
export interface ICharityBeneficiary {
  readonly fullName: string;
  readonly relationNote: string;
  readonly phone: string | null;
  readonly address: string | null;
  readonly consentStatus: 'PENDING' | 'CONFIRMED';
  readonly verificationNote: string | null;
  readonly updatedAt: Date;
}

export type ICharityBeneficiaryInput = Omit<ICharityBeneficiary, 'updatedAt'>;

export interface ICharityNeedsView {
  readonly campaignId: string;
  readonly needs: readonly ICharityNeedItem[];
  /**
   * Chỉ số TRÌNH BÀY, không phải số lượng và không phải nguồn sự thật.
   *
   * `null` khi chiến dịch chưa khai dòng nhu cầu nào — khác `0` ("chưa nhận được
   * gì"). Xem `overallNeedProgressPercent`.
   */
  readonly overallProgressPercent: number | null;
  /**
   * Tiến độ đang đọc từ đâu (§10).
   *
   * `NEED_ITEMS` khi chiến dịch có bảng nhu cầu; `LEGACY_DECLARED` khi chưa có và
   * hai cột tổng hợp cũ (`target_items_count`/`current_items_count`) vẫn là thứ duy
   * nhất nói được tiến độ. Client mới phải đọc cờ này chứ không đoán theo việc
   * `needs` rỗng hay không.
   */
  readonly progressSource: 'LEGACY_DECLARED' | 'NEED_ITEMS';
}

export interface ICharityCampaignPage {
  readonly items: ICharityCampaign[];
  readonly total: number;
}

export interface ICharityCampaignRepository extends ICharityNeedsRepositoryPart {
  create(params: ICreateCharityCampaignParams): Promise<ICharityCampaign>;

  /**
   * Thay CẢ BỘ media và `banner_url` của một hồ sơ còn chờ duyệt.
   *
   * Kiểm người tạo và trạng thái DƯỚI KHOÁ dòng: Admin duyệt chen giữa thì lượt thay
   * phải thua, không được ghi media vào một hồ sơ đã công khai.
   *
   * @throws CharityCampaignNotFoundException, CharityNotOrganizerException,
   *   CharityMediaNotEditableException, CharityMediaInvalidException (key đã thuộc hoạt động khác)
   */
  replaceMedia(params: {
    campaignId: string;
    actorUserId: string;
    media: readonly ICharityCampaignMediaParams[];
    bannerUrl: string;
  }): Promise<ICharityCampaign>;

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

export interface ICharityNeedsRepositoryPart {
  /**
   * Gửi một đề nghị đóng góp cùng các dòng, trong MỘT transaction.
   *
   * Hai lượt ghi rời sẽ để lại một đề nghị không có dòng nào — và nó hiện trong
   * danh sách của organizer như một đề nghị trống, không ai hiểu được.
   */
  createContribution(
    params: ICreateCharityContributionParams,
  ): Promise<ICharityContribution>;

  /** Đề nghị của một chiến dịch — đường của organizer/coordinator. */
  listContributionsByCampaign(params: {
    campaignId: string;
    status?: CharityContributionStatus;
    limit: number;
    offset: number;
  }): Promise<ICharityContributionPage>;

  /** Đề nghị của chính người gọi, mọi chiến dịch. */
  listContributionsByContributor(params: {
    contributorId: string;
    limit: number;
    offset: number;
  }): Promise<ICharityContributionPage>;

  findContributionByGlobalId(
    globalId: string,
  ): Promise<ICharityContribution | null>;

  /**
   * Sửa đề nghị: thay TRỌN bộ dòng, không vá từng dòng.
   *
   * Điều kiện `status = 'PENDING_REVIEW'` nằm trong câu `UPDATE` chứ không chỉ ở
   * tầng trên: hai request sửa song song đều đọc thấy còn sửa được rồi cùng ghi, và
   * database là chỗ duy nhất thấy cái thứ hai. Khớp 0 hàng thì nơi gọi dịch thành
   * một lỗi nghiệp vụ đọc được.
   *
   * Trả `null` khi không còn sửa được.
   */
  replaceContribution(params: {
    contributionId: string;
    contributorId: string;
    note: string | null;
    contactNote: string | null;
    items: readonly ICreateCharityContributionItemParams[];
  }): Promise<ICharityContribution | null>;

  /**
   * Quyết MỌI dòng của một đề nghị và sinh lượt giao nhận, trong MỘT transaction
   * (F65b §5).
   *
   * Khoá theo thứ tự CỐ ĐỊNH, giống hệt ở `completeDelivery` và `cancelDelivery`:
   * `campaigns` → `campaign_need_items` theo `id` tăng dần → đề nghị và các dòng.
   * Hai đường xin khoá theo hai thứ tự khác nhau là một deadlock chờ ngày xảy ra.
   *
   * Phần còn thiếu được tính lại SAU khi đã giữ khoá các dòng nhu cầu, nên hai người
   * cùng chấp nhận vào một nhu cầu thì người sau thấy con số người trước để lại —
   * tiêu chí §11.1. Vượt thì ném `CharityNeedExceededException` kèm phần còn lại mới
   * nhất, không âm thầm cắt số.
   *
   * Retry CÙNG `decisionKey` trả lại đúng kết quả cũ với `replayed = true` và không
   * ghi gì — tiêu chí §11.7.
   */
  decideContribution(params: {
    contributionId: string;
    organizerId: string;
    decisionKey: string;
    decisions: readonly {
      contributionItemId: string;
      acceptedQuantity: number;
      rejectionReason?: CharityRejectionReason | null;
    }[];
  }): Promise<IDecideContributionResult>;

  /**
   * Hoàn tất lượt giao nhận: người tổ chức xác nhận số THỰC NHẬN từng dòng (§6).
   *
   * Chuyển phần đã chấp nhận sang phần đã nhận trên từng dòng nhu cầu, và cộng điểm
   * `CHARITY_CONTRIBUTION_COMPLETED` cho người tặng — một lần cho mỗi đề nghị, nuốt
   * lỗi chính sách vì rule đang TẮT chờ Bên A chốt mức.
   */
  completeDelivery(params: {
    deliveryId: string;
    organizerId: string;
    received: readonly { needItemId: string; receivedQuantity: number }[];
  }): Promise<ICharityDelivery>;

  /**
   * Huỷ lượt giao nhận: trả phần đã chấp nhận về nhu cầu, KHÔNG xoá đề nghị hay
   * lịch sử (tiêu chí §11.4). Người tặng hoặc người tổ chức đều huỷ được.
   */
  cancelDelivery(params: {
    deliveryId: string;
    actorUserId: string;
    reason: string;
  }): Promise<ICharityDelivery>;

  findDeliveryByGlobalId(globalId: string): Promise<ICharityDelivery | null>;

  /**
   * Ghi nhận vật phẩm nhận NGOÀI APP (F65b §7). Cộng vào `received_quantity` của
   * dòng nhu cầu trong cùng transaction, khoá theo thứ tự cố định.
   *
   * KHÔNG chặn vượt mục tiêu: đây là vật phẩm ĐÃ nhận thật. Từ chối ghi một thứ đã ở
   * trong kho là bắt người tổ chức chọn giữa nói dối và không ghi gì.
   */
  recordExternalContribution(params: {
    campaignId: string;
    recordedBy: string;
    needItemId: string;
    quantity: number;
    sourceLabel: string;
    receivedAt: Date;
    evidenceNote: string | null;
  }): Promise<ICharityExternalContribution>;

  /**
   * Huỷ hoặc điều chỉnh một bản ghi ngoài app — KHÔNG sửa tại chỗ (§7).
   *
   * Huỷ: `ACTIVE → VOIDED`, trừ lại khỏi `received_quantity`. Điều chỉnh: huỷ bản cũ
   * rồi chèn bản mới với `replacesId` trỏ về bản cũ, trong cùng transaction. Trigger ở
   * database từ chối mọi `UPDATE` khác, nên không có đường nào ghi đè lịch sử.
   */
  amendExternalContribution(params: {
    externalId: string;
    actorUserId: string;
    action: 'VOID' | 'ADJUST';
    reason: string;
    /** Bắt buộc khi `ADJUST`. */
    quantity?: number;
  }): Promise<ICharityExternalContribution>;

  listExternalContributions(
    campaignId: string,
  ): Promise<ICharityExternalContribution[]>;

  /**
   * Đóng chiến dịch (§8): `is_active = false` + đặt `end_time`, giữ `approval_status`;
   * từ chối hàng loạt đề nghị đang chờ với `CAMPAIGN_CLOSED`; KHÔNG đụng lượt giao
   * nhận đang chạy. Quyền (người tổ chức hoặc Admin) do use case kiểm.
   */
  closeCampaign(params: {
    campaignId: string;
    actorUserId: string;
  }): Promise<ICloseCampaignResult>;

  /**
   * Gia hạn chiến dịch đang mở, ghi một hàng audit trong cùng transaction (§8).
   * Chỉ DỜI RA SAU — rút ngắn đi qua đường đóng. Quyền do use case kiểm.
   */
  /**
   * Người này có quyền ĐIỀU PHỐI hoạt động không: người tổ chức, hoặc coordinator
   * còn hiệu lực (F65b §2). Không gồm đóng/gia hạn/giao quyền — những việc đó chỉ
   * người tổ chức.
   */
  isCampaignManager(campaignId: string, userId: string): Promise<boolean>;

  findBeneficiary(campaignId: string): Promise<ICharityBeneficiary | null>;

  /**
   * Ghi người thụ hưởng. Chuyển đồng ý về `PENDING` khi hoạt động đang public thì ẨN
   * hoạt động trong cùng transaction (`is_active = false`, giữ `end_time` — tức ĐÌNH
   * CHỈ theo bảng ánh xạ §8). `hidden = true` khi điều đó xảy ra.
   */
  upsertBeneficiary(params: {
    campaignId: string;
    actorUserId: string;
    beneficiary: ICharityBeneficiaryInput;
  }): Promise<{ beneficiary: ICharityBeneficiary; hidden: boolean }>;

  /** Giao quyền coordinator. Giao lại cho người đang có quyền thì không làm gì. */
  grantCoordinator(params: {
    campaignId: string;
    userId: string;
    grantedBy: string;
  }): Promise<void>;

  /** Thu quyền: đặt `revoked_at`, không xoá hàng. `false` khi không có gì để thu. */
  revokeCoordinator(params: {
    campaignId: string;
    userId: string;
    revokedBy: string;
  }): Promise<boolean>;

  listCoordinators(
    campaignId: string,
  ): Promise<{ userId: string; grantedBy: string; grantedAt: Date }[]>;

  extendCampaign(params: {
    campaignId: string;
    actorUserId: string;
    newEndTime: Date;
    reason: string;
  }): Promise<{ campaignId: string; previousEndTime: Date; newEndTime: Date }>;

  /** Rút đề nghị. `null` khi không còn rút được. Rút là đổi trạng thái, không xoá. */
  withdrawContribution(params: {
    contributionId: string;
    contributorId: string;
  }): Promise<ICharityContribution | null>;

  /**
   * Bảng nhu cầu của một chiến dịch, kèm projection từng dòng.
   *
   * Nhận `campaignId` canonical (uuid). Trả cả dòng đã tắt (`is_active = false`) để
   * nơi gọi tự quyết hiện hay không: một dòng đã tắt mà đã có đề nghị vẫn là lịch
   * sử cần đọc được.
   */
  listNeeds(campaignId: string): Promise<ICharityNeedItem[]>;
}

export const ICharityCampaignRepository = Symbol('ICharityCampaignRepository');
