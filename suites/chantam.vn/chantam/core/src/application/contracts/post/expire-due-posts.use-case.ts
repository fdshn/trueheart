import { IUseCase } from '@chantam/service.common-lib';

export interface IExpireDuePostsCommand {
  /** Cho phép test bơm mốc thời gian; bỏ trống thì lấy `now()`. */
  now?: Date;
}

export interface IExpireDuePostsResult {
  expired: number;
  convertedToOffer: number;
}

export interface IExpireDuePostsUseCase extends IUseCase<
  IExpireDuePostsCommand,
  IExpireDuePostsResult
> {}

export const IExpireDuePostsUseCase = Symbol('IExpireDuePostsUseCase');
