import {
  CharityBeneficiaryKind,
  CharityCallToAction,
  CharityCustomFieldType,
  CharityDeliveryMethod,
  CharityFieldVisibility,
  CharityItemCondition,
  CharityOpenClosedStatus,
  CharityOperationStage,
  CharityPartyRole,
  CharityPhaseKey,
  CharityReportMode,
  CharitySupplySource,
  CharityTeamRole,
  CharityVolunteerNeedStatus,
  CharityVolunteerRegistrationStatus,
} from '@chantam.vn/chantam.core-lib/models';

/**
 * Dự án từ thiện 4 giai đoạn — phần hồ sơ, giai đoạn và ba nhóm nhu cầu
 * (docs/plan/CHARITY-PROJECT-LIFECYCLE.md, đợt 1).
 *
 * Khung chiến dịch (`campaigns`, bảng nhu cầu vật phẩm, đóng góp, giao nhận) vẫn ở
 * `ICharityCampaignRepository`; repository này chỉ thêm những gì dự án cần thêm.
 */

export interface ICharityProjectProfile {
  appealPurpose: string | null;
  appealAudience: string | null;
  appealCircumstance: string | null;
  callToActions: CharityCallToAction[];
  /** Ghi đè của Admin; `null` = theo cấu hình toàn hệ thống. */
  maxBankAccounts: number | null;
}

export interface ICharityStageEvent {
  fromStage: CharityOperationStage;
  toStage: CharityOperationStage;
  /** `null` = hệ thống (job theo mốc thời gian). */
  actorId: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface ICharityPartyInput {
  /** Có thì cập nhật đúng dòng đó; không có thì tạo mới. */
  partyId?: string | null;
  role: CharityPartyRole;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  hotline: string | null;
  picName: string | null;
  picPhone: string | null;
  picUserId: string | null;
  beneficiaryKind: CharityBeneficiaryKind | null;
  evidenceUrls: string[];
}

export interface ICharityParty extends ICharityPartyInput {
  partyId: string;
  /** Người thụ hưởng của kêu gọi cá nhân — quản lý qua `PUT :id/beneficiary`, riêng tư. */
  isAppealSubject: boolean;
  updatedAt: Date;
}

export interface ICharityBankAccountInput {
  label: string | null;
  bankName: string;
  accountNo: string;
  accountName: string;
}

export interface ICharityBankAccount extends ICharityBankAccountInput {
  accountId: string;
  validFrom: Date;
  validTo: Date | null;
  closeReason: string | null;
}

export interface ICharityTeamMemberInput {
  memberId?: string | null;
  role: CharityTeamRole;
  displayName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  position: string | null;
  userId: string | null;
  bankAccountId: string | null;
}

export interface ICharityTeamMember extends ICharityTeamMemberInput {
  memberId: string;
  username: string | null;
}

export interface ICharityPhase {
  phase: CharityPhaseKey;
  startsAt: Date;
  endsAt: Date;
  picName: string | null;
  picUserId: string | null;
  hotline: string | null;
  deliveryMethod: CharityDeliveryMethod | null;
  reportMode: CharityReportMode | null;
}

export interface ICharityNeedItemProfileInput {
  unitPrice: number | null;
  estimatedValue: number | null;
  itemCondition: CharityItemCondition | null;
  conditionNote: string | null;
  supplySource: CharitySupplySource | null;
  intakeDeadline: Date | null;
  dropoffAddress: string | null;
  deliveryInstruction: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  intakeStatus: CharityOpenClosedStatus;
}

export interface ICharityItemNeed extends ICharityNeedItemProfileInput {
  needItemId: string;
  itemName: string;
  unit: string;
  targetQuantity: number;
  /** Đề nghị đang chờ quyết (chưa chấp nhận). */
  registeredQuantity: number;
  approvedQuantity: number;
  receivedInAppQuantity: number;
  receivedExternalQuantity: number;
  remainingQuantity: number;
  isActive: boolean;
}

export interface ICharityFundingNeedInput {
  title: string;
  description: string | null;
  beneficiaryPartyId: string | null;
  receivingUnit: string | null;
  bankAccountId: string | null;
  targetAmount: number;
  deadline: Date | null;
  sortOrder: number;
}

export interface ICharityFundingNeed extends ICharityFundingNeedInput {
  fundingNeedId: string;
  confirmedAmount: number;
  externalAmount: number;
  remainingAmount: number;
  status: CharityOpenClosedStatus;
  updatedAt: Date;
}

export interface ICharityVolunteerNeedInput {
  title: string;
  description: string | null;
  requirements: string | null;
  neededCount: number;
  startsAt: Date | null;
  endsAt: Date | null;
  locationLabel: string | null;
  sortOrder: number;
}

export interface ICharityVolunteerNeed extends ICharityVolunteerNeedInput {
  volunteerNeedId: string;
  status: CharityVolunteerNeedStatus;
  registeredCount: number;
  confirmedCount: number;
  remainingCount: number;
}

export interface ICharityVolunteerRegistration {
  volunteerNeedId: string;
  userId: string;
  username: string;
  status: CharityVolunteerRegistrationStatus;
  note: string | null;
  createdAt: Date;
}

export interface ICharitySectionState {
  sectionKey: CharityOperationStage;
  savedAt: Date | null;
  publishedAt: Date | null;
  publishedSnapshot: unknown;
  updatedBy: string | null;
}

export interface ICharityCustomFieldInput {
  label: string;
  fieldType: CharityCustomFieldType;
  visibility: CharityFieldVisibility;
  required: boolean;
  options: string[];
  value: unknown;
}

export interface ICharityCustomSectionInput {
  parentSection: CharityOperationStage;
  title: string;
  visibility: CharityFieldVisibility;
  fields: ICharityCustomFieldInput[];
}

export interface ICharityCustomSection extends ICharityCustomSectionInput {
  customSectionId: string;
  fields: (ICharityCustomFieldInput & { customFieldId: string })[];
  updatedAt: Date;
}

export type SubmitCharityDraftOutcome = 'SUBMITTED' | 'NOT_DRAFT';

export type MoveCharityStageOutcome = 'MOVED' | 'STALE';

export type AddCharityBankAccountOutcome =
  | { status: 'CREATED'; account: ICharityBankAccount }
  | { status: 'LIMIT_REACHED'; limit: number }
  | { status: 'REPLACED_NOT_FOUND' };

export type RegisterCharityVolunteerOutcome =
  'REGISTERED' | 'ALREADY_REGISTERED' | 'NOT_FOUND' | 'CLOSED' | 'FULL';

export interface ICharityProjectRepository {
  /**
   * Id của dự án hiện ra ngoài theo id hoặc slug: đã duyệt, chưa xoá, đang chạy HOẶC đã đóng
   * (không đình chỉ). Rộng hơn `findPublicByIdOrSlug` của chiến dịch (chỉ dự án còn bật).
   */
  findVisibleCampaignId(idOrSlug: string): Promise<string | null>;
  getProfile(campaignId: string): Promise<ICharityProjectProfile | null>;
  updateProfile(params: {
    campaignId: string;
    actorId: string;
    profile: Omit<ICharityProjectProfile, 'maxBankAccounts'>;
  }): Promise<void>;
  /** Chỉ Admin. `null` = bỏ ghi đè, về cấu hình toàn hệ thống. */
  setMaxBankAccounts(params: {
    campaignId: string;
    actorId: string;
    maxBankAccounts: number | null;
    reason: string;
  }): Promise<boolean>;

  /**
   * Gửi duyệt bản nháp: đặt `submitted_at` và trạng thái duyệt do use case quyết (public ngay
   * hay chờ duyệt) trong MỘT câu lệnh có điều kiện `submitted_at IS NULL` — gửi hai lần song
   * song thì lượt sau nhận `NOT_DRAFT`.
   */
  submitDraft(params: {
    campaignId: string;
    actorId: string;
    approvalStatus: 'APPROVED' | 'PENDING_APPROVAL';
  }): Promise<SubmitCharityDraftOutcome>;

  /** Đổi giai đoạn có điều kiện giai đoạn hiện tại = `from`, ghi nhật ký cùng lúc. */
  moveStage(params: {
    campaignId: string;
    from: CharityOperationStage;
    to: CharityOperationStage;
    actorId: string | null;
    reason: string | null;
  }): Promise<MoveCharityStageOutcome>;
  listStageEvents(campaignId: string): Promise<ICharityStageEvent[]>;
  /** Dự án có cột giai đoạn có thể đã trễ so với mốc thời gian — cho job. */
  listStageCandidates(limit: number): Promise<
    {
      campaignId: string;
      stored: CharityOperationStage;
      distribution: { startsAt: Date; endsAt: Date } | null;
      endTime: Date;
    }[]
  >;

  listParties(campaignId: string): Promise<ICharityParty[]>;
  /**
   * Thay danh sách đơn vị liên quan, GIỮ id cho dòng có `partyId` (hạng mục kêu gọi tiền trỏ
   * vào bên thụ hưởng theo id). Dòng `is_appeal_subject` không bao giờ bị chạm ở đây.
   */
  replaceParties(params: {
    campaignId: string;
    actorId: string;
    parties: ICharityPartyInput[];
  }): Promise<ICharityParty[]>;

  listBankAccounts(campaignId: string): Promise<ICharityBankAccount[]>;
  /**
   * Thêm tài khoản; `replacesAccountId` thì đóng tài khoản đó TRONG CÙNG transaction (đổi tài
   * khoản = đóng bản cũ + tạo bản mới). Đếm giới hạn dưới khoá hàng dự án.
   */
  addBankAccount(params: {
    campaignId: string;
    actorId: string;
    account: ICharityBankAccountInput;
    replacesAccountId: string | null;
    replaceReason: string | null;
    limit: number;
  }): Promise<AddCharityBankAccountOutcome>;
  closeBankAccount(params: {
    campaignId: string;
    accountId: string;
    actorId: string;
    reason: string;
  }): Promise<boolean>;

  listTeam(campaignId: string): Promise<ICharityTeamMember[]>;
  replaceTeam(params: {
    campaignId: string;
    actorId: string;
    members: ICharityTeamMemberInput[];
  }): Promise<ICharityTeamMember[]>;

  listPhases(campaignId: string): Promise<ICharityPhase[]>;
  replacePhases(params: {
    campaignId: string;
    actorId: string;
    phases: ICharityPhase[];
  }): Promise<ICharityPhase[]>;

  listItemNeeds(campaignId: string): Promise<ICharityItemNeed[]>;
  updateItemNeedProfile(params: {
    campaignId: string;
    needItemId: string;
    actorId: string;
    profile: ICharityNeedItemProfileInput;
  }): Promise<boolean>;

  listFundingNeeds(campaignId: string): Promise<ICharityFundingNeed[]>;
  createFundingNeed(params: {
    campaignId: string;
    actorId: string;
    need: ICharityFundingNeedInput;
  }): Promise<ICharityFundingNeed>;
  updateFundingNeed(params: {
    campaignId: string;
    fundingNeedId: string;
    actorId: string;
    need: ICharityFundingNeedInput;
    confirmedAmount: number;
    externalAmount: number;
    status: CharityOpenClosedStatus;
  }): Promise<ICharityFundingNeed | null>;

  listVolunteerNeeds(campaignId: string): Promise<ICharityVolunteerNeed[]>;
  createVolunteerNeed(params: {
    campaignId: string;
    actorId: string;
    need: ICharityVolunteerNeedInput;
  }): Promise<ICharityVolunteerNeed>;
  updateVolunteerNeed(params: {
    campaignId: string;
    volunteerNeedId: string;
    actorId: string;
    need: ICharityVolunteerNeedInput;
    status: CharityVolunteerNeedStatus;
  }): Promise<ICharityVolunteerNeed | null>;
  /**
   * Đăng ký tham gia, dưới khoá hàng vị trí: kiểm đủ người và điều kiện "có ít nhất một hỗ trợ
   * đã được chấp nhận" trong cùng transaction với lượt ghi.
   */
  registerVolunteer(params: {
    campaignId: string;
    volunteerNeedId: string;
    userId: string;
    note: string | null;
  }): Promise<RegisterCharityVolunteerOutcome>;
  cancelVolunteer(params: {
    campaignId: string;
    volunteerNeedId: string;
    userId: string;
  }): Promise<boolean>;
  confirmVolunteer(params: {
    campaignId: string;
    volunteerNeedId: string;
    userId: string;
    actorId: string;
  }): Promise<boolean>;
  listVolunteerRegistrations(
    campaignId: string,
  ): Promise<ICharityVolunteerRegistration[]>;
  findMyVolunteerRegistrations(
    campaignId: string,
    userId: string,
  ): Promise<ICharityVolunteerRegistration[]>;

  listSectionStates(campaignId: string): Promise<ICharitySectionState[]>;
  saveSection(params: {
    campaignId: string;
    sectionKey: CharityOperationStage;
    actorId: string;
  }): Promise<void>;
  publishSection(params: {
    campaignId: string;
    sectionKey: CharityOperationStage;
    actorId: string;
    snapshot: unknown;
  }): Promise<void>;

  listCustomSections(campaignId: string): Promise<ICharityCustomSection[]>;
  replaceCustomSections(params: {
    campaignId: string;
    actorId: string;
    sections: ICharityCustomSectionInput[];
  }): Promise<ICharityCustomSection[]>;
}

export const ICharityProjectRepository = Symbol('ICharityProjectRepository');
