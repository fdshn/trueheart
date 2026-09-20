import { IGetSmartMatchesResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IGetSmartMatchesCommand {
  /** Bài nguồn cần tìm bài ghép. */
  postId: string;
  /** Người gọi — phải là tác giả bài nguồn. */
  userId: string;
  radiusMeters?: number;
  take?: number;
}

export interface IGetSmartMatchesUseCase extends IUseCase<
  IGetSmartMatchesCommand,
  IGetSmartMatchesResponseDto
> {}

export const IGetSmartMatchesUseCase = Symbol('IGetSmartMatchesUseCase');
