import { IGetPostRequestsResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IListPostRequestsCommand {
  postId: string;
  currentUserId: string;
  currentUserRole?: string;
}

export type IListPostRequestsResult = IGetPostRequestsResponseDto;

export type IListPostRequestsUseCase = IUseCase<
  IListPostRequestsCommand,
  IListPostRequestsResult
>;

export const IListPostRequestsUseCase = Symbol('IListPostRequestsUseCase');
