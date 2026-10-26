import {
  IGetAdminRecipientSelectionResponseDto,
  IGetTransactionSelectionReasonResponseDto,
  IListAdminRecipientSelectionsQueryDto,
  IListAdminRecipientSelectionsResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { IUseCase } from '@chantam/service.common-lib';

export interface IListAdminRecipientSelectionsCommand extends IListAdminRecipientSelectionsQueryDto {
  actorUserId: string;
}

export interface IListAdminRecipientSelectionsUseCase extends IUseCase<
  IListAdminRecipientSelectionsCommand,
  IListAdminRecipientSelectionsResponseDto
> {}

export const IListAdminRecipientSelectionsUseCase = Symbol(
  'IListAdminRecipientSelectionsUseCase',
);

export interface IGetAdminRecipientSelectionCommand {
  actorUserId: string;
  transactionId: string;
}

export interface IGetAdminRecipientSelectionUseCase extends IUseCase<
  IGetAdminRecipientSelectionCommand,
  IGetAdminRecipientSelectionResponseDto
> {}

export const IGetAdminRecipientSelectionUseCase = Symbol(
  'IGetAdminRecipientSelectionUseCase',
);

export interface IGetTransactionSelectionReasonCommand {
  userId: string;
  transactionId: string;
}

export interface IGetTransactionSelectionReasonUseCase extends IUseCase<
  IGetTransactionSelectionReasonCommand,
  IGetTransactionSelectionReasonResponseDto
> {}

export const IGetTransactionSelectionReasonUseCase = Symbol(
  'IGetTransactionSelectionReasonUseCase',
);
