import { GiftRequestStatuses } from '@chantam.vn/chantam.core-lib/consts';
import {
  IGiftRequestDto,
  IMyGiftRequestDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';
import { IPaginationMetaDto } from '@chantam/service.common-lib/dto';

export interface IListMyGiftRequestsCommand {
  requesterId: string;
  /** Bỏ trống thì trả mọi trạng thái, kể cả đã rút và đã đóng. */
  status?: GiftRequestStatuses;
  page: number;
  pageSize: number;
}

export interface IListMyGiftRequestsResult {
  requests: IMyGiftRequestDto[];
  meta: IPaginationMetaDto;
}

export interface IListMyGiftRequestsUseCase extends IUseCase<
  IListMyGiftRequestsCommand,
  IListMyGiftRequestsResult
> {}

export const IListMyGiftRequestsUseCase = Symbol('IListMyGiftRequestsUseCase');

export interface IRejectGiftRequestCommand {
  postId: string;
  requestId: string;
  /** Người gọi; phải là chủ bài. */
  userId: string;
}

export interface IRejectGiftRequestResult {
  request: IGiftRequestDto;
}

export interface IRejectGiftRequestUseCase extends IUseCase<
  IRejectGiftRequestCommand,
  IRejectGiftRequestResult
> {}

export const IRejectGiftRequestUseCase = Symbol('IRejectGiftRequestUseCase');
