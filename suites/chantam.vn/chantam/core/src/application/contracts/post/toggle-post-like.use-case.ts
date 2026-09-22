import { IUseCase } from '@chantam/service.common-lib';

export interface ITogglePostLikeCommand {
  postId: string;
  userId: string;
}

export interface ITogglePostLikeResult {
  liked: boolean;
  likeCount: number;
}

export interface ITogglePostLikeUseCase extends IUseCase<
  ITogglePostLikeCommand,
  ITogglePostLikeResult
> {}

export const ITogglePostLikeUseCase = Symbol('ITogglePostLikeUseCase');
