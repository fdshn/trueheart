import { IListGiftTransactionsResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IListOwnGiftTransactionsCommand {
  userId: string;
}

export type IListOwnGiftTransactionsResult = IListGiftTransactionsResponseDto;

export interface IListOwnGiftTransactionsUseCase extends IUseCase<
  IListOwnGiftTransactionsCommand,
  IListOwnGiftTransactionsResult
> {}

export const IListOwnGiftTransactionsUseCase = Symbol(
  'IListOwnGiftTransactionsUseCase',
);
