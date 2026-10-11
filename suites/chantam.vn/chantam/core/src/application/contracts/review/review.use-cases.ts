import {
  IGetTransactionReviewsResponseDto,
  ISubmitReviewBodyDto,
  ISubmitReviewResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface ISubmitReviewCommand extends ISubmitReviewBodyDto {
  userId: string;
  transactionId: string;
}

export type ISubmitReviewResult = ISubmitReviewResponseDto;

export interface ISubmitReviewUseCase extends IUseCase<
  ISubmitReviewCommand,
  ISubmitReviewResult
> {}

export const ISubmitReviewUseCase = Symbol('ISubmitReviewUseCase');

/**
 * Sửa đánh giá đã gửi, tối đa một lần, trước `completed_at + N` (CHỐT-10 mục 4).
 *
 * Cùng hình dạng body với lệnh gửi: một lần sửa là một bản đánh giá ĐẦY ĐỦ, không
 * phải một bản vá từng trường. Gửi `{rating}` mà hiểu là "giữ bình luận cũ" sẽ làm
 * việc XOÁ bình luận không diễn đạt được, và client không có cách nói điều đó.
 */
export interface IEditReviewCommand extends ISubmitReviewBodyDto {
  userId: string;
  transactionId: string;
}

export type IEditReviewResult = ISubmitReviewResponseDto;

export interface IEditReviewUseCase extends IUseCase<
  IEditReviewCommand,
  IEditReviewResult
> {}

export const IEditReviewUseCase = Symbol('IEditReviewUseCase');

export interface IGetTransactionReviewsCommand {
  userId: string;
  transactionId: string;
}

export type IGetTransactionReviewsResult = IGetTransactionReviewsResponseDto;

export interface IGetTransactionReviewsUseCase extends IUseCase<
  IGetTransactionReviewsCommand,
  IGetTransactionReviewsResult
> {}

export const IGetTransactionReviewsUseCase = Symbol(
  'IGetTransactionReviewsUseCase',
);
