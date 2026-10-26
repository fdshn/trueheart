import { IUseCase } from '@chantam/service.common-lib';

export interface IExpireDuePostsCommand {
  /** Cho phép test bơm mốc thời gian; bỏ trống thì lấy `now()`. */
  now?: Date;
}

export interface IExpiredPostSummary {
  postId: string;
  authorId: string;
  title: string;
}

export interface IExpireDuePostsResult {
  expired: number;
  /**
   * ID những bài vừa chuyển sang `EXPIRED`.
   *
   * Con số không đủ: yêu cầu còn treo dưới chúng phải được đóng, và người xin
   * phải được báo. Rao vặt cũng nằm đây: từ 26/10 nó hết hạn như mọi bài.
   */
  /**
   * Bài vừa sang `EXPIRED`, kèm chủ bài và tiêu đề.
   *
   * Trả cả cụm chứ không chỉ id: hai việc sau lượt quét cần hai thứ khác nhau —
   * đóng yêu cầu cần `postId`, báo cho chủ bài cần `authorId` và `title`. Giữ
   * thêm một mảng `expiredPostIds` song song là hai nguồn cho một sự thật.
   */
  expiredPosts: IExpiredPostSummary[];
}

export interface IExpireDuePostsUseCase extends IUseCase<
  IExpireDuePostsCommand,
  IExpireDuePostsResult
> {}

export const IExpireDuePostsUseCase = Symbol('IExpireDuePostsUseCase');
