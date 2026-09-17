import { IUseCase } from '@chantam/service.common-lib';

export interface IDeletePostCommand {
  postId: string;
  userId: string;
}

export interface IDeletePostResult {}

export interface IDeletePostUseCase extends IUseCase<
  IDeletePostCommand,
  IDeletePostResult
> {}

export const IDeletePostUseCase = Symbol('IDeletePostUseCase');
