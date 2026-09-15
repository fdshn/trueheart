import { PlatformErrors } from '../consts/error-catalog';
import { ExceptionFrom } from './error-catalog';

export class BadRequestException extends ExceptionFrom(
  PlatformErrors.BAD_REQUEST,
) {}
