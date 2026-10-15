import {
  GiftTransactionStatuses,
  IAdminGiftTransactionItem,
} from '@/domain/ports/repository';
import { GiftEvidenceKinds } from '@chantam.vn/chantam.core-lib/consts';
import { IUseCase } from '@chantam/service.common-lib';
import { PaginationMetaDto } from '@chantam/service.common-lib/dto';

/**
 * Cùng tên `transactionId` như `GiftTransactionDto` của đường người dùng, để FE
 * dùng chung một kiểu cho hai màn.
 */
export type IAdminGiftTransactionView = Omit<
  IAdminGiftTransactionItem,
  'globalId'
> & {
  readonly transactionId: string;
};

export interface IListAdminGiftTransactionsCommand {
  readonly actorUserId: string;
  readonly status?: GiftTransactionStatuses;
  /** Khớp người tặng HOẶC người nhận. */
  readonly userId?: string;
  readonly postId?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface IListAdminGiftTransactionsResult {
  readonly transactions: IAdminGiftTransactionView[];
  readonly meta: PaginationMetaDto;
}

export interface IListAdminGiftTransactionsUseCase extends IUseCase<
  IListAdminGiftTransactionsCommand,
  IListAdminGiftTransactionsResult
> {}

export const IListAdminGiftTransactionsUseCase = Symbol(
  'IListAdminGiftTransactionsUseCase',
);

export interface IAdminGiftEvidenceItem {
  readonly kind: GiftEvidenceKinds;
  readonly slot: number;
  readonly url: string;
  readonly uploadedBy: string;
  readonly createdAt: Date;
}

export interface IGetAdminGiftTransactionCommand {
  readonly actorUserId: string;
  readonly transactionId: string;
}

export interface IGetAdminGiftTransactionResult {
  readonly transaction: IAdminGiftTransactionView;
  readonly evidence: IAdminGiftEvidenceItem[];
}

export interface IGetAdminGiftTransactionUseCase extends IUseCase<
  IGetAdminGiftTransactionCommand,
  IGetAdminGiftTransactionResult
> {}

export const IGetAdminGiftTransactionUseCase = Symbol(
  'IGetAdminGiftTransactionUseCase',
);
