import { IUseCase } from '@chantam/service.common-lib';

export interface IRemovePostMediaCommand {
  postId: string;
  mediaId: number;
  userId: string;
}

export interface IRemovePostMediaResult {}

export interface IRemovePostMediaUseCase extends IUseCase<
  IRemovePostMediaCommand,
  IRemovePostMediaResult
> {}

export const IRemovePostMediaUseCase = Symbol('IRemovePostMediaUseCase');
