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
