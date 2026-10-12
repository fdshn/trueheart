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
