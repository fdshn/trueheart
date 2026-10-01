import { IBatchAcceptRequestsResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IBatchAcceptRequestsCommand {
  postId: string;
  /** Chủ bài. Quyền được kiểm lại trong cùng transaction ở tầng repository. */
  userId: string;
  requestIds: string[];
}

export interface IBatchAcceptRequestsResult extends IBatchAcceptRequestsResponseDto {}

export type IBatchAcceptRequestsUseCase = IUseCase<
  IBatchAcceptRequestsCommand,
  IBatchAcceptRequestsResult
>;

export const IBatchAcceptRequestsUseCase = Symbol(
  'IBatchAcceptRequestsUseCase',
);
