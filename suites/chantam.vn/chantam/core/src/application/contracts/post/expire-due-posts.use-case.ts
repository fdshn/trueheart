import { IUseCase } from '@chantam/service.common-lib';

export interface IExpireDuePostsCommand {
  /** Cho phép test bơm mốc thời gian; bỏ trống thì lấy `now()`. */
  now?: Date;
}

export interface IExpireDuePostsResult {
  expired: number;
  convertedToOffer: number;
  /**
   * ID những bài vừa chuyển sang `EXPIRED`.
   *
   * Con số không đủ: yêu cầu còn treo dưới chúng phải được đóng, và người xin
   * phải được báo. Bài rao vặt chuyển thành Muốn Tặng KHÔNG nằm đây — nó vẫn
   * mở, nên hàng đợi của nó vẫn còn nguyên giá trị.
   */
  expiredPostIds: string[];
}

export interface IExpireDuePostsUseCase extends IUseCase<
  IExpireDuePostsCommand,
  IExpireDuePostsResult
> {}

export const IExpireDuePostsUseCase = Symbol('IExpireDuePostsUseCase');
