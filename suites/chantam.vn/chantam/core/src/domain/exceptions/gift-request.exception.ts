import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class GiftRequestNotFoundException extends ExceptionFrom(
  CoreErrors.GIFT_REQUEST_NOT_FOUND,
) {}

export class GiftRequestDuplicatedException extends ExceptionFrom(
  CoreErrors.GIFT_REQUEST_DUPLICATED,
) {}

/**
 * Chủ bài không đủ hạng để chọn tay người nhận (CHỐT-10).
 *
 * KHÁC `ForbiddenException` ở chỗ: người gọi ĐÚNG là chủ bài, chỉ không có quyền
 * này. Dùng chung một lỗi cho "không phải bài của bạn" và "bài của bạn nhưng chưa
 * đủ hạng" làm client không phân biệt được, và chủ bài sẽ tưởng bài mình bị treo.
 */
export class SelectRequesterNotAllowedException extends ExceptionFrom(
  CoreErrors.SELECT_REQUESTER_NOT_ALLOWED,
) {}

export class CannotRequestOwnPostException extends ExceptionFrom(
  CoreErrors.CANNOT_REQUEST_OWN_POST,
) {}

export class PostNotAcceptingRequestsException extends ExceptionFrom(
  CoreErrors.POST_NOT_ACCEPTING_REQUESTS,
) {}

export class OpenRequestQuotaExceededException extends ExceptionFrom(
  CoreErrors.OPEN_REQUEST_QUOTA_EXCEEDED,
) {}

export class RedemptionNotAvailableException extends ExceptionFrom(
  CoreErrors.REDEMPTION_NOT_AVAILABLE,
) {}

export class RedemptionPriceUnavailableException extends ExceptionFrom(
  CoreErrors.REDEMPTION_PRICE_UNAVAILABLE,
) {}

export class RedemptionInsufficientPointsException extends ExceptionFrom(
  CoreErrors.REDEMPTION_INSUFFICIENT_POINTS,
) {}

/**
 * Giá bằng điểm đã đổi giữa lúc xem trước và lúc bấm (CHỐT-10 mục 2).
 *
 * Hai thứ làm giá đổi, và cả hai đều ngoài tay người đổi: chủ bài sửa giá trị
 * tham khảo, hoặc Admin đổi tỷ lệ VNĐ/điểm. Tới trước 11/10 đường bấm tính lại
 * theo giá MỚI rồi trừ luôn — người dùng xác nhận 500 điểm và bị trừ 1.000.
 *
 * Nên lệnh đổi mang theo con số người dùng ĐÃ THẤY, và lệch thì không trừ gì.
 */
export class RedemptionQuoteStaleException extends ExceptionFrom(
  CoreErrors.REDEMPTION_QUOTE_STALE,
) {}

export class OfferGiftTargetNotWantedException extends ExceptionFrom(
  CoreErrors.OFFER_GIFT_TARGET_NOT_WANTED,
) {}

export class OfferGiftSourceInvalidException extends ExceptionFrom(
  CoreErrors.OFFER_GIFT_SOURCE_INVALID,
) {}
