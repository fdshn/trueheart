import { ErrorCodes, ErrorOrigin } from '@chantam.vn/chantam.core-lib/consts';
import { Exception } from '@chantam/service.common-lib/exception';
import { HttpStatus } from '@nestjs/common';

export class GiftPostNotFoundException extends Exception {
  public static readonly httpStatus = HttpStatus.NOT_FOUND;

  public constructor(giftPostId: string) {
    super(
      ErrorCodes.GIFT_POST_NOT_FOUND,
      `Không tìm thấy bài đăng ${giftPostId}`,
      undefined,
      ErrorOrigin,
    );
  }
}
