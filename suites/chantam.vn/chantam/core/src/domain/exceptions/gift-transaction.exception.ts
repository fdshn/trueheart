import { CoreErrors } from '@chantam.vn/chantam.core-lib/consts';
import { ExceptionFrom } from '@chantam/service.common-lib/exception';

export class GiftTransactionNotFoundException extends ExceptionFrom(
  CoreErrors.GIFT_TRANSACTION_NOT_FOUND,
) {}

export class GiftTransactionInvalidStateException extends ExceptionFrom(
  CoreErrors.GIFT_TRANSACTION_INVALID_STATE,
) {}

export class GiftTransactionNotParticipantException extends ExceptionFrom(
  CoreErrors.GIFT_TRANSACTION_NOT_PARTICIPANT,
) {}

export class GiftTransactionOutOfStockException extends ExceptionFrom(
  CoreErrors.GIFT_TRANSACTION_OUT_OF_STOCK,
) {}

export class GiftTransactionDuplicateRequestException extends ExceptionFrom(
  CoreErrors.GIFT_TRANSACTION_DUPLICATE_REQUEST,
) {}

export class ShipPayerNotReceiverException extends ExceptionFrom(
  CoreErrors.SHIP_PAYER_NOT_RECEIVER,
) {}
