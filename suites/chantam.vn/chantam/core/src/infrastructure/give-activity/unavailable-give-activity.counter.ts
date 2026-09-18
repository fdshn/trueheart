import {
  ICompletedGiftCountCommand,
  IGiveActivityCounter,
  IGiveActivityCountResult,
} from '@/domain/ports/give-activity.counter';
import { Injectable } from '@nestjs/common';

/**
 * M3 has no completed-gift source yet. Deliberately return unavailable rather
 * than guessing a count, so due cycles remain auditable and non-punitive.
 */
@Injectable()
export class UnavailableGiveActivityCounter implements IGiveActivityCounter {
  public async countCompletedGifts(
    _command: ICompletedGiftCountCommand,
  ): Promise<IGiveActivityCountResult> {
    return { available: false };
  }
}
