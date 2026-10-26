import {
  IGetAdminRecipientSelectionUseCase,
  IGetTransactionSelectionReasonUseCase,
  IListAdminRecipientSelectionsUseCase,
} from '@/application/contracts/recipient-selection';
import { Global, Module } from '@nestjs/common';
import {
  GetAdminRecipientSelectionUseCase,
  GetTransactionSelectionReasonUseCase,
  ListAdminRecipientSelectionsUseCase,
} from './recipient-selection.use-cases';

/** `@Global()` như mọi feature module của tầng application — xem `DharmaModule`. */
@Global()
@Module({
  providers: [
    {
      provide: IListAdminRecipientSelectionsUseCase,
      useClass: ListAdminRecipientSelectionsUseCase,
    },
    {
      provide: IGetAdminRecipientSelectionUseCase,
      useClass: GetAdminRecipientSelectionUseCase,
    },
    {
      provide: IGetTransactionSelectionReasonUseCase,
      useClass: GetTransactionSelectionReasonUseCase,
    },
  ],
  exports: [
    IListAdminRecipientSelectionsUseCase,
    IGetAdminRecipientSelectionUseCase,
    IGetTransactionSelectionReasonUseCase,
  ],
})
export class RecipientSelectionModule {}
