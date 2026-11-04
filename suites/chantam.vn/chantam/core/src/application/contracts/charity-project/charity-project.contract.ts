import { ICharityCampaignView } from '@/application/contracts/charity-campaign';
import {
  ICharityBankAccount,
  ICharityBankAccountInput,
  ICharityChangedField,
  ICharityCustomSection,
  ICharityCustomSectionInput,
  ICharityEngagementCounters,
  ICharityEventStep,
  ICharityFinancialReport,
  ICharityFundingNeed,
  ICharityFundingNeedInput,
  ICharityItemNeed,
  ICharityNeedItemProfileInput,
  ICharityParty,
  ICharityPartyInput,
  ICharityPhase,
  ICharityProjectProfile,
  ICharityPublicSupporters,
  ICharityStageEvent,
  ICharitySummary,
  ICharityTask,
  ICharityTeamMember,
  ICharityTeamMemberInput,
  ICharityVolunteerNeed,
  ICharityVolunteerNeedInput,
  ICharityVolunteerRegistration,
} from '@/domain/ports/repository';
import {
  CharityCallToAction,
  CharityOpenClosedStatus,
  CharityOperationStage,
  CharitySectionCompletionStatus,
  CharityVolunteerNeedStatus,
} from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';

/** Mọi lệnh trên một dự án mang hai thứ này. */
export interface ICharityProjectCommand {
  readonly userId: string;
  readonly campaignId: string;
}

export interface ICharityProjectSectionView {
  sectionKey: CharityOperationStage;
  label: string;
  completionStatus: CharitySectionCompletionStatus;
  savedAt: Date | null;
  publishedAt: Date | null;
  updatedBy: string | null;
}

export interface ICharityWorkspaceCapabilities {
  canEdit: boolean;
  canSave: boolean;
  canPublish: boolean;
  canSubmit: boolean;
  canAdvanceStage: boolean;
  canManageVolunteers: boolean;
  canUpdateTasks: boolean;
  canViewStats: boolean;
  canExportPdf: boolean;
  canShare: boolean;
}

/** Workspace ban tổ chức: toàn bộ dữ liệu nội bộ (§3.12). */
export interface ICharityWorkspace {
  campaign: ICharityCampaignView;
  profile: ICharityProjectProfile;
  maxBankAccountsEffective: number;
  parties: ICharityParty[];
  bankAccounts: ICharityBankAccount[];
  team: ICharityTeamMember[];
  phases: ICharityPhase[];
  itemNeeds: ICharityItemNeed[];
  fundingNeeds: ICharityFundingNeed[];
  volunteerNeeds: ICharityVolunteerNeed[];
  volunteerRegistrations: ICharityVolunteerRegistration[];
  stageEvents: ICharityStageEvent[];
  sections: ICharityProjectSectionView[];
  customSections: ICharityCustomSection[];
  /** Checklist tab B — rỗng tới khi dự án được duyệt (§3.4). */
  tasks: ICharityTask[];
  /** Timeline tab C — rỗng tới khi dự án được duyệt (§3.5). */
  eventSteps: (ICharityEventStep & { label: string })[];
  /** Mọi field đã sửa kể từ lúc duyệt, kể cả field riêng tư (§3.3). */
  changedFields: ICharityChangedField[];
  counters: ICharityEngagementCounters;
  capabilities: ICharityWorkspaceCapabilities;
}

export interface ICharityPublicParty {
  role: string;
  name: string;
  beneficiaryKind: string | null;
  address: string | null;
  hotline: string | null;
  email: string | null;
}

export interface ICharityPublicProject {
  campaign: ICharityCampaignView;
  appealPurpose: string | null;
  appealAudience: string | null;
  appealCircumstance: string | null;
  callToActions: CharityCallToAction[];
  /** Mục đã công khai: bản chụp lúc publish. Mục chưa công khai → `published: false`. */
  sections: {
    sectionKey: CharityOperationStage;
    label: string;
    published: boolean;
    publishedAt: Date | null;
    content: unknown;
  }[];
  bankAccounts: ICharityBankAccount[];
  itemNeeds: ICharityItemNeed[];
  fundingNeeds: ICharityFundingNeed[];
  volunteerNeeds: ICharityVolunteerNeed[];
  myVolunteerRegistrations: ICharityVolunteerRegistration[] | null;
  /** Field CÔNG KHAI đã sửa kể từ lúc duyệt — app tô đỏ (§3.3). */
  changedFields: ICharityChangedField[];
  /** Timeline SỐNG của sự kiện trao (§3.5). */
  eventSteps: (ICharityEventStep & { label: string })[];
  /** Tổng kết ĐÃ công khai (§3.6); `null` khi chưa. */
  summary: ICharitySummary | null;
  /** Báo cáo tài chính — chỉ có khi tổng kết đã công khai. */
  financialReports: ICharityFinancialReport[];
  /** Nickname người cho phép hiện + con số tổng (§3.17). */
  supporters: ICharityPublicSupporters;
  counters: ICharityEngagementCounters;
  /** `null` khi không đăng nhập. */
  isFollowing: boolean | null;
  capabilities: {
    canJoinVolunteer: boolean;
    canContribute: boolean;
    canReport: boolean;
    canFollow: boolean;
    canComment: boolean;
  };
}

export interface ISubmitCharityProjectUseCase extends IUseCase<
  ICharityProjectCommand,
  ICharityCampaignView
> {}
export const ISubmitCharityProjectUseCase = Symbol(
  'ISubmitCharityProjectUseCase',
);

export interface IMoveCharityStageCommand extends ICharityProjectCommand {
  readonly to: CharityOperationStage;
  readonly reason: string | null;
}
export interface IMoveCharityStageUseCase extends IUseCase<
  IMoveCharityStageCommand,
  ICharityCampaignView
> {}
export const IMoveCharityStageUseCase = Symbol('IMoveCharityStageUseCase');

export interface IUpdateCharityProfileCommand extends ICharityProjectCommand {
  readonly profile: {
    appealPurpose?: string | null;
    appealAudience?: string | null;
    appealCircumstance?: string | null;
    callToActions?: CharityCallToAction[];
  };
}
export interface IUpdateCharityProfileUseCase extends IUseCase<
  IUpdateCharityProfileCommand,
  ICharityProjectProfile
> {}
export const IUpdateCharityProfileUseCase = Symbol(
  'IUpdateCharityProfileUseCase',
);

export interface IReplaceCharityPartiesCommand extends ICharityProjectCommand {
  readonly parties: ICharityPartyInput[];
}
export interface IReplaceCharityPartiesUseCase extends IUseCase<
  IReplaceCharityPartiesCommand,
  ICharityParty[]
> {}
export const IReplaceCharityPartiesUseCase = Symbol(
  'IReplaceCharityPartiesUseCase',
);

export interface IAddCharityBankAccountCommand extends ICharityProjectCommand {
  readonly account: ICharityBankAccountInput;
  readonly replacesAccountId: string | null;
  readonly replaceReason: string | null;
}
export interface IAddCharityBankAccountUseCase extends IUseCase<
  IAddCharityBankAccountCommand,
  ICharityBankAccount
> {}
export const IAddCharityBankAccountUseCase = Symbol(
  'IAddCharityBankAccountUseCase',
);

export interface ICloseCharityBankAccountCommand extends ICharityProjectCommand {
  readonly accountId: string;
  readonly reason: string;
}
export interface ICloseCharityBankAccountUseCase extends IUseCase<
  ICloseCharityBankAccountCommand,
  { closed: true }
> {}
export const ICloseCharityBankAccountUseCase = Symbol(
  'ICloseCharityBankAccountUseCase',
);

export interface IReplaceCharityTeamCommand extends ICharityProjectCommand {
  readonly members: ICharityTeamMemberInput[];
}
export interface IReplaceCharityTeamUseCase extends IUseCase<
  IReplaceCharityTeamCommand,
  ICharityTeamMember[]
> {}
export const IReplaceCharityTeamUseCase = Symbol('IReplaceCharityTeamUseCase');

export interface IReplaceCharityPhasesCommand extends ICharityProjectCommand {
  readonly phases: ICharityPhase[];
}
export interface IReplaceCharityPhasesUseCase extends IUseCase<
  IReplaceCharityPhasesCommand,
  ICharityPhase[]
> {}
export const IReplaceCharityPhasesUseCase = Symbol(
  'IReplaceCharityPhasesUseCase',
);

export interface IUpdateCharityItemNeedCommand extends ICharityProjectCommand {
  readonly needItemId: string;
  readonly profile: ICharityNeedItemProfileInput;
}
export interface IUpdateCharityItemNeedUseCase extends IUseCase<
  IUpdateCharityItemNeedCommand,
  ICharityItemNeed
> {}
export const IUpdateCharityItemNeedUseCase = Symbol(
  'IUpdateCharityItemNeedUseCase',
);

export interface ISaveCharityFundingNeedCommand extends ICharityProjectCommand {
  /** `null` = tạo mới. */
  readonly fundingNeedId: string | null;
  readonly need: ICharityFundingNeedInput;
  readonly confirmedAmount?: number;
  readonly externalAmount?: number;
  readonly status?: CharityOpenClosedStatus;
}
export interface ISaveCharityFundingNeedUseCase extends IUseCase<
  ISaveCharityFundingNeedCommand,
  ICharityFundingNeed
> {}
export const ISaveCharityFundingNeedUseCase = Symbol(
  'ISaveCharityFundingNeedUseCase',
);

export interface ISaveCharityVolunteerNeedCommand extends ICharityProjectCommand {
  readonly volunteerNeedId: string | null;
  readonly need: ICharityVolunteerNeedInput;
  readonly status?: CharityVolunteerNeedStatus;
}
export interface ISaveCharityVolunteerNeedUseCase extends IUseCase<
  ISaveCharityVolunteerNeedCommand,
  ICharityVolunteerNeed
> {}
export const ISaveCharityVolunteerNeedUseCase = Symbol(
  'ISaveCharityVolunteerNeedUseCase',
);

export interface ICharityVolunteerRegistrationCommand extends ICharityProjectCommand {
  readonly volunteerNeedId: string;
  /** Người đăng ký (huỷ/xác nhận); đăng ký thì là `userId`. */
  readonly targetUserId?: string;
  readonly note?: string | null;
}
export interface IRegisterCharityVolunteerUseCase extends IUseCase<
  ICharityVolunteerRegistrationCommand,
  { registered: true }
> {}
export const IRegisterCharityVolunteerUseCase = Symbol(
  'IRegisterCharityVolunteerUseCase',
);
export interface ICancelCharityVolunteerUseCase extends IUseCase<
  ICharityVolunteerRegistrationCommand,
  { cancelled: true }
> {}
export const ICancelCharityVolunteerUseCase = Symbol(
  'ICancelCharityVolunteerUseCase',
);
export interface IConfirmCharityVolunteerUseCase extends IUseCase<
  ICharityVolunteerRegistrationCommand,
  { confirmed: true }
> {}
export const IConfirmCharityVolunteerUseCase = Symbol(
  'IConfirmCharityVolunteerUseCase',
);

export interface ICharitySectionCommand extends ICharityProjectCommand {
  readonly sectionKey: CharityOperationStage;
}
export interface ISaveCharitySectionUseCase extends IUseCase<
  ICharitySectionCommand,
  ICharityProjectSectionView
> {}
export const ISaveCharitySectionUseCase = Symbol('ISaveCharitySectionUseCase');
export interface IPublishCharitySectionUseCase extends IUseCase<
  ICharitySectionCommand,
  ICharityProjectSectionView
> {}
export const IPublishCharitySectionUseCase = Symbol(
  'IPublishCharitySectionUseCase',
);

export interface IReplaceCharityCustomSectionsCommand extends ICharityProjectCommand {
  readonly sections: ICharityCustomSectionInput[];
}
export interface IReplaceCharityCustomSectionsUseCase extends IUseCase<
  IReplaceCharityCustomSectionsCommand,
  ICharityCustomSection[]
> {}
export const IReplaceCharityCustomSectionsUseCase = Symbol(
  'IReplaceCharityCustomSectionsUseCase',
);

export interface IGetCharityWorkspaceUseCase extends IUseCase<
  ICharityProjectCommand,
  ICharityWorkspace
> {}
export const IGetCharityWorkspaceUseCase = Symbol(
  'IGetCharityWorkspaceUseCase',
);

export interface IGetCharityPublicProjectCommand {
  readonly idOrSlug: string;
  readonly userId: string | null;
}
export interface IGetCharityPublicProjectUseCase extends IUseCase<
  IGetCharityPublicProjectCommand,
  ICharityPublicProject
> {}
export const IGetCharityPublicProjectUseCase = Symbol(
  'IGetCharityPublicProjectUseCase',
);

export interface ISetCharityLimitsCommand extends ICharityProjectCommand {
  readonly maxBankAccounts: number | null;
  readonly reason: string;
}
export interface ISetCharityLimitsUseCase extends IUseCase<
  ISetCharityLimitsCommand,
  { maxBankAccounts: number | null; maxBankAccountsEffective: number }
> {}
export const ISetCharityLimitsUseCase = Symbol('ISetCharityLimitsUseCase');

export interface IAdvanceCharityStagesUseCase extends IUseCase<
  { limit: number; dryRun: boolean },
  { advanced: number; checked: number }
> {}
export const IAdvanceCharityStagesUseCase = Symbol(
  'IAdvanceCharityStagesUseCase',
);
