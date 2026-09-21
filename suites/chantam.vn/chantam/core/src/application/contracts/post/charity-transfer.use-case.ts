import {
  IRequestCharityTransferBodyDto,
  IRequestCharityTransferParamsDto,
  IRequestCharityTransferResponseDto,
  IReviewCharityTransferBodyDto,
  IReviewCharityTransferParamsDto,
  IReviewCharityTransferResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IRequestCharityTransferCommand
  extends IRequestCharityTransferParamsDto, IRequestCharityTransferBodyDto {
  userId: string;
}

export interface IRequestCharityTransferResult extends IRequestCharityTransferResponseDto {}

export interface IRequestCharityTransferUseCase extends IUseCase<
  IRequestCharityTransferCommand,
  IRequestCharityTransferResult
> {}

export const IRequestCharityTransferUseCase = Symbol(
  'IRequestCharityTransferUseCase',
);

export interface IReviewCharityTransferCommand
  extends IReviewCharityTransferParamsDto, IReviewCharityTransferBodyDto {
  username: string;
}

export interface IReviewCharityTransferResult extends IReviewCharityTransferResponseDto {}

export interface IReviewCharityTransferUseCase extends IUseCase<
  IReviewCharityTransferCommand,
  IReviewCharityTransferResult
> {}

export const IReviewCharityTransferUseCase = Symbol(
  'IReviewCharityTransferUseCase',
);
