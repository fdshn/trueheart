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
  /**
   * Gỡ một ảnh và trả về `r2Key` của nó, hoặc `null` khi không có gì để gỡ.
   *
   * Trả key chứ không trả `boolean`: không có nó thì tầng ứng dụng không biết
   * object nào cần dọn, và ảnh nằm lại trong bucket vĩnh viễn — bản ghi đã mất
   * nên không còn gì trỏ tới nó nữa.
   */
  removeByPostId(postId: string, mediaId: number): Promise<string | null>;
}

export const IPostMediaRepository = Symbol('IPostMediaRepository');
