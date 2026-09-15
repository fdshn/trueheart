import { PlatformErrors } from '../consts/error-catalog';
import { ExceptionFrom } from './error-catalog';

export class ValidationFailedException extends ExceptionFrom(
  PlatformErrors.VALIDATION_FAILED,
) {}
