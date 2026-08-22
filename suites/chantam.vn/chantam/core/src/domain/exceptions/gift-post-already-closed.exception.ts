import { ErrorCodes, ErrorOrigin } from '@chantam.vn/chantam.core-lib/consts';
import { Exception } from '@chantam/service.common-lib/exception';
import { HttpStatus } from '@nestjs/common';

export class GiftPostAlreadyClosedException extends Exception {
  public static readonly httpStatus = HttpStatus.CONFLICT;

  public constructor(giftPostId: string, status: string) {
    super(
      ErrorCodes.GIFT_POST_ALREADY_CLOSED,
      `Bài đăng ${giftPostId} đang ở trạng thái ${status}, không thể chỉnh sửa`,
      undefined,
      ErrorOrigin,
    );
  }
}
