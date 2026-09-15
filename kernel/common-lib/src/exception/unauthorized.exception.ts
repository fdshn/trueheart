import { PlatformErrors } from '../consts/error-catalog';
import { ExceptionFrom } from './error-catalog';

export class UnauthorizedException extends ExceptionFrom(
  PlatformErrors.UNAUTHORIZED,
) {}
