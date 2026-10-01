import {
  IAdjustUserPointsBodyDto,
  IAdjustUserPointsResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IAdjustUserPointsCommand extends IAdjustUserPointsBodyDto {
  actorUserId: string;
}

export type IAdjustUserPointsResult = IAdjustUserPointsResponseDto;

export interface IAdjustUserPointsUseCase extends IUseCase<
  IAdjustUserPointsCommand,
  IAdjustUserPointsResult
> {}

export const IAdjustUserPointsUseCase = Symbol('IAdjustUserPointsUseCase');
