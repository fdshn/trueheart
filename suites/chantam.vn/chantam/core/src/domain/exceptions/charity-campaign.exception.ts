import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class CharityCampaignNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_CAMPAIGN_NOT_FOUND,
) {}

export class CharityCampaignCreateNotAllowedException extends ExceptionFrom(
  CoreErrors.CHARITY_CAMPAIGN_CREATE_NOT_ALLOWED,
) {}

export class CharityParticipationClosedException extends ExceptionFrom(
  CoreErrors.CHARITY_PARTICIPATION_CLOSED,
) {}

export class CharityAlreadyRegisteredException extends ExceptionFrom(
  CoreErrors.CHARITY_ALREADY_REGISTERED,
) {}

export class CharityNotRegisteredException extends ExceptionFrom(
  CoreErrors.CHARITY_NOT_REGISTERED,
) {}

export class CharityCancelTooLateException extends ExceptionFrom(
  CoreErrors.CHARITY_CANCEL_TOO_LATE,
) {}

export class CharityReviewTooEarlyException extends ExceptionFrom(
  CoreErrors.CHARITY_REVIEW_TOO_EARLY,
) {}

export class CharityReviewNotPermittedException extends ExceptionFrom(
  CoreErrors.CHARITY_REVIEW_NOT_PERMITTED,
) {}

export class CharityReviewDuplicateException extends ExceptionFrom(
  CoreErrors.CHARITY_REVIEW_DUPLICATE,
) {}

export class CharityNotOrganizerException extends ExceptionFrom(
  CoreErrors.CHARITY_NOT_ORGANIZER,
) {}

export class CharityApprovalAlreadyDecidedException extends ExceptionFrom(
  CoreErrors.CHARITY_APPROVAL_ALREADY_DECIDED,
) {}

/** Hoạt động không nhận đề nghị: chưa duyệt, đã đóng, hoặc đang bị đình chỉ. */
export class CharityNotAcceptingContributionsException extends ExceptionFrom(
  CoreErrors.CHARITY_NOT_ACCEPTING_CONTRIBUTIONS,
) {}

/** Dòng nhu cầu không thuộc hoạt động này, hoặc người tổ chức đã rút nó. */
export class CharityNeedItemInvalidException extends ExceptionFrom(
  CoreErrors.CHARITY_NEED_ITEM_INVALID,
) {}

export class CharityContributionNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_CONTRIBUTION_NOT_FOUND,
) {}

/**
 * Đề nghị đã được xét nên khoá (F65b §4).
 *
 * Ném từ HAI chỗ: use case ném khi đọc thấy trạng thái đã qua `PENDING_REVIEW`,
 * còn repository trả `null` khi câu `UPDATE ... AND status = 'PENDING_REVIEW'`
 * khớp 0 hàng — đường duy nhất thấy hai lượt sửa song song.
 */
export class CharityContributionNotEditableException extends ExceptionFrom(
  CoreErrors.CHARITY_CONTRIBUTION_NOT_EDITABLE,
) {}

export class CharityContributionAlreadyDecidedException extends ExceptionFrom(
  CoreErrors.CHARITY_CONTRIBUTION_ALREADY_DECIDED,
) {}

/** Dòng gửi lên không khớp, hoặc sai luật lý do — kèm câu nói rõ dòng nào. */
export class CharityLinesInvalidException extends ExceptionFrom(
  CoreErrors.CHARITY_LINES_INVALID,
) {}

/**
 * Lượt chấp nhận làm vượt phần còn thiếu (F65b §5).
 *
 * Ném TRONG transaction đang giữ khoá các dòng nhu cầu, nên `remaining` trong thông
 * điệp là con số mới nhất thật — không ai ghi xen vào được giữa lúc tính và lúc báo.
 */
export class CharityNeedExceededException extends ExceptionFrom(
  CoreErrors.CHARITY_NEED_EXCEEDED,
) {}

export class CharityDeliveryNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_DELIVERY_NOT_FOUND,
) {}

export class CharityDeliveryInvalidStateException extends ExceptionFrom(
  CoreErrors.CHARITY_DELIVERY_INVALID_STATE,
) {}

/** Người tổ chức gửi đề nghị vào chính hoạt động của mình. */
export class CharitySelfContributionException extends ExceptionFrom(
  CoreErrors.CHARITY_SELF_CONTRIBUTION,
) {}

/** Chiến dịch chưa duyệt hoặc đã đóng rồi. */
export class CharityCampaignNotClosableException extends ExceptionFrom(
  CoreErrors.CHARITY_CAMPAIGN_NOT_CLOSABLE,
) {}

export class CharityExternalContributionNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_EXTERNAL_CONTRIBUTION_NOT_FOUND,
) {}

/** Đã huỷ hoặc đã bị thay — sửa một nhánh lịch sử không còn ai đọc là vô nghĩa. */
export class CharityExternalContributionVoidedException extends ExceptionFrom(
  CoreErrors.CHARITY_EXTERNAL_CONTRIBUTION_VOIDED,
) {}

/** Không gia hạn được: chưa duyệt, đã đóng/đình chỉ, hoặc mốc mới không dời ra sau. */
export class CharityCampaignNotExtendableException extends ExceptionFrom(
  CoreErrors.CHARITY_CAMPAIGN_NOT_EXTENDABLE,
) {}

export class CharityCoordinatorNotAllowedException extends ExceptionFrom(
  CoreErrors.CHARITY_COORDINATOR_NOT_ALLOWED,
) {}

export class CharityBeneficiaryNotApplicableException extends ExceptionFrom(
  CoreErrors.CHARITY_BENEFICIARY_NOT_APPLICABLE,
) {}

/** Kêu gọi cho người khác chưa có đồng ý `CONFIRMED` — không được ra ngoài (§2). */
export class CharityBeneficiaryConsentRequiredException extends ExceptionFrom(
  CoreErrors.CHARITY_BENEFICIARY_CONSENT_REQUIRED,
) {}

/** Bộ media sai hình dạng/loại, hoặc có key đã thuộc hoạt động khác. Nhận chi tiết lỗi. */
export class CharityMediaInvalidException extends ExceptionFrom(
  CoreErrors.CHARITY_MEDIA_INVALID,
) {}

/** Hồ sơ đã qua bước duyệt — media khoá lại (spec D4). */
export class CharityMediaNotEditableException extends ExceptionFrom(
  CoreErrors.CHARITY_MEDIA_NOT_EDITABLE,
) {}

export class CharityCampaignHasActivityException extends ExceptionFrom(
  CoreErrors.CHARITY_CAMPAIGN_HAS_ACTIVITY,
) {}

export class CharityProjectNotDraftException extends ExceptionFrom(
  CoreErrors.CHARITY_PROJECT_NOT_DRAFT,
) {}

export class CharityStageTransitionInvalidException extends ExceptionFrom(
  CoreErrors.CHARITY_STAGE_TRANSITION_INVALID,
) {}

export class CharityStageScheduleConflictException extends ExceptionFrom(
  CoreErrors.CHARITY_STAGE_SCHEDULE_CONFLICT,
) {}

export class CharityBankAccountLimitException extends ExceptionFrom(
  CoreErrors.CHARITY_BANK_ACCOUNT_LIMIT,
) {}

export class CharityBankAccountNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_BANK_ACCOUNT_NOT_FOUND,
) {}

export class CharityFundingNeedNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_FUNDING_NEED_NOT_FOUND,
) {}

export class CharityVolunteerNeedNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_VOLUNTEER_NEED_NOT_FOUND,
) {}

export class CharityVolunteerClosedException extends ExceptionFrom(
  CoreErrors.CHARITY_VOLUNTEER_CLOSED,
) {}

export class CharityVolunteerRegistrationNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_VOLUNTEER_REGISTRATION_NOT_FOUND,
) {}

export class CharitySectionEmptyException extends ExceptionFrom(
  CoreErrors.CHARITY_SECTION_EMPTY,
) {}

export class CharityProjectInactiveException extends ExceptionFrom(
  CoreErrors.CHARITY_PROJECT_INACTIVE,
) {}

export class CharityProjectForbiddenException extends ExceptionFrom(
  CoreErrors.CHARITY_PROJECT_FORBIDDEN,
) {}

export class CharityProjectNotApprovedException extends ExceptionFrom(
  CoreErrors.CHARITY_PROJECT_NOT_APPROVED,
) {}

export class CharityTaskNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_TASK_NOT_FOUND,
) {}

export class CharityExportNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_EXPORT_NOT_FOUND,
) {}

export class CharitySectionNotPublishedException extends ExceptionFrom(
  CoreErrors.CHARITY_SECTION_NOT_PUBLISHED,
) {}

export class CharityEventStepNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_EVENT_STEP_NOT_FOUND,
) {}

export class CharityPostNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_POST_NOT_FOUND,
) {}

export class CharityPostForbiddenException extends ExceptionFrom(
  CoreErrors.CHARITY_POST_FORBIDDEN,
) {}

export class CharityPostQuotaExceededException extends ExceptionFrom(
  CoreErrors.CHARITY_POST_QUOTA_EXCEEDED,
) {}

export class CharityPostMediaInvalidException extends ExceptionFrom(
  CoreErrors.CHARITY_POST_MEDIA_INVALID,
) {}

export class CharitySummaryNotOpenException extends ExceptionFrom(
  CoreErrors.CHARITY_SUMMARY_NOT_OPEN,
) {}

export class CharitySummaryFinancialRequiredException extends ExceptionFrom(
  CoreErrors.CHARITY_SUMMARY_FINANCIAL_REQUIRED,
) {}

export class CharitySummaryEmptyException extends ExceptionFrom(
  CoreErrors.CHARITY_SUMMARY_EMPTY,
) {}

export class CharityFinancialReportNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_FINANCIAL_REPORT_NOT_FOUND,
) {}

export class CharityEvaluationTargetInvalidException extends ExceptionFrom(
  CoreErrors.CHARITY_EVALUATION_TARGET_INVALID,
) {}

export class CharityAppealNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_APPEAL_NOT_FOUND,
) {}

export class CharityAppealNotAllowedException extends ExceptionFrom(
  CoreErrors.CHARITY_APPEAL_NOT_ALLOWED,
) {}

export class CharityAppealDuplicatedException extends ExceptionFrom(
  CoreErrors.CHARITY_APPEAL_DUPLICATED,
) {}

export class CharityAppealInvalidStateException extends ExceptionFrom(
  CoreErrors.CHARITY_APPEAL_INVALID_STATE,
) {}

export class CharityParticipationNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_PARTICIPATION_NOT_FOUND,
) {}

export class CharityParticipationInvalidStateException extends ExceptionFrom(
  CoreErrors.CHARITY_PARTICIPATION_INVALID_STATE,
) {}

export class CharitySupportNeedNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_SUPPORT_NEED_NOT_FOUND,
) {}

export class CharitySupportNeedClosedException extends ExceptionFrom(
  CoreErrors.CHARITY_SUPPORT_NEED_CLOSED,
) {}

export class CharitySupportNeedInUseException extends ExceptionFrom(
  CoreErrors.CHARITY_SUPPORT_NEED_IN_USE,
) {}

export class CharitySupportOfferNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_SUPPORT_OFFER_NOT_FOUND,
) {}

export class CharitySupportOfferInvalidStateException extends ExceptionFrom(
  CoreErrors.CHARITY_SUPPORT_OFFER_INVALID_STATE,
) {}

export class CharityRoundNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_ROUND_NOT_FOUND,
) {}

export class CharityRoundInvalidStateException extends ExceptionFrom(
  CoreErrors.CHARITY_ROUND_INVALID_STATE,
) {}

export class CharityProjectCompletionBlockedException extends ExceptionFrom(
  CoreErrors.CHARITY_PROJECT_COMPLETION_BLOCKED,
) {}

export class CharityExternalSourceDuplicatedException extends ExceptionFrom(
  CoreErrors.CHARITY_EXTERNAL_SOURCE_DUPLICATED,
) {}

export class CharityDisputeNotFoundException extends ExceptionFrom(
  CoreErrors.CHARITY_DISPUTE_NOT_FOUND,
) {}

export class CharityDisputeNotAllowedException extends ExceptionFrom(
  CoreErrors.CHARITY_DISPUTE_NOT_ALLOWED,
) {}

export class CharityDisputeAlreadyOpenException extends ExceptionFrom(
  CoreErrors.CHARITY_DISPUTE_ALREADY_OPEN,
) {}

export class CharityDisputeInvalidStateException extends ExceptionFrom(
  CoreErrors.CHARITY_DISPUTE_INVALID_STATE,
) {}

export class CharityPostVideoTooLongException extends ExceptionFrom(
  CoreErrors.CHARITY_POST_VIDEO_TOO_LONG,
) {}

export class CharityAppealConflictOfInterestException extends ExceptionFrom(
  CoreErrors.CHARITY_APPEAL_CONFLICT_OF_INTEREST,
) {}

export class CharityAppealWindowClosedException extends ExceptionFrom(
  CoreErrors.CHARITY_APPEAL_WINDOW_CLOSED,
) {}

export class CharityAppealRateLimitedException extends ExceptionFrom(
  CoreErrors.CHARITY_APPEAL_RATE_LIMITED,
) {}
