import { PlatformErrors } from '../consts/error-catalog';
import { ExceptionFrom } from './error-catalog';

export class ForbiddenException extends ExceptionFrom(
  PlatformErrors.FORBIDDEN,
) {}
