import { UserRanks } from '@chantam.vn/chantam.core-lib/consts';

export interface ICompletedGiftCountCommand {
  readonly userId: string;
  readonly cycleStart: Date;
  readonly cycleEnd: Date;
  readonly rank: UserRanks;
}

export interface IUnavailableGiftCountResult {
  readonly available: false;
}

export interface IAvailableGiftCountResult {
  readonly available: true;
  readonly completedGifts: number;
}

export type IGiveActivityCountResult =
  IUnavailableGiftCountResult | IAvailableGiftCountResult;

export interface IGiveActivityCounter {
  countCompletedGifts(
    command: ICompletedGiftCountCommand,
  ): Promise<IGiveActivityCountResult>;
}

export const IGiveActivityCounter = Symbol('IGiveActivityCounter');
