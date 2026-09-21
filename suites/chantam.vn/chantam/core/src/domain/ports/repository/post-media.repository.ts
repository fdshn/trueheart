import { IPostMediaEntity } from '@chantam.vn/chantam.core-lib/entities';

export interface IPostMediaRepository {
  countByPostId(postId: string): Promise<number>;
  listByPostId(postId: string): Promise<IPostMediaEntity[]>;
  listByPostIds(postIds: string[]): Promise<IPostMediaEntity[]>;
  attach(postId: string, r2Key: string): Promise<IPostMediaEntity | null>;
  replaceOrder(
    postId: string,
    mediaIds: number[],
  ): Promise<IPostMediaEntity[] | null>;
  removeByPostId(postId: string, mediaId: number): Promise<boolean>;
}

export const IPostMediaRepository = Symbol('IPostMediaRepository');
