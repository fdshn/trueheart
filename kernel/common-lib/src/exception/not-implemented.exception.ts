import { PlatformErrors } from '../consts/error-catalog';
import { ExceptionFrom } from './error-catalog';

export class NotImplementedException extends ExceptionFrom(
  PlatformErrors.NOT_IMPLEMENTED,
) {}
