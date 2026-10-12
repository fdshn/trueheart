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
