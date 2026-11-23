import {
  IPointFeedResponseDto,
  IUserPointFeedResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

/** Bảng tin điểm (CR 22/11/2026): chung khi `userId = null`, của một người khi có `userId`. */
export interface IGetPointFeedCommand {
  viewerId: string;
  userId: string | null;
  afterId: number | null;
  limit: number;
}

export interface IGetPointFeedUseCase extends IUseCase<
  IGetPointFeedCommand,
  IPointFeedResponseDto | IUserPointFeedResponseDto
> {}

export const IGetPointFeedUseCase = Symbol('IGetPointFeedUseCase');
