import {
  IAcceptGiftRequestUseCase,
  IAutoSelectDueRecipientsUseCase,
  ICreateGiftRequestUseCase,
  IListPostRequestsUseCase,
  IWithdrawGiftRequestUseCase,
} from '@/application/contracts/gift-request';
import { Global, Module } from '@nestjs/common';
import { AcceptGiftRequestUseCase } from './accept-gift-request.use-case';
import { AcceptedRequestNotifier } from './accepted-request.notifier';
import { AutoSelectDueRecipientsUseCase } from './auto-select-due-recipients.use-case';
import { CreateGiftRequestUseCase } from './create-gift-request.use-case';
import { ListPostRequestsUseCase } from './list-post-requests.use-case';
import { WithdrawGiftRequestUseCase } from './withdraw-gift-request.use-case';

@Global()
@Module({
  providers: [
    AcceptedRequestNotifier,
    { provide: ICreateGiftRequestUseCase, useClass: CreateGiftRequestUseCase },
    {
      provide: IAutoSelectDueRecipientsUseCase,
      useClass: AutoSelectDueRecipientsUseCase,
    },
    {
      provide: IWithdrawGiftRequestUseCase,
      useClass: WithdrawGiftRequestUseCase,
    },
    { provide: IListPostRequestsUseCase, useClass: ListPostRequestsUseCase },
    {
      provide: IAcceptGiftRequestUseCase,
      useClass: AcceptGiftRequestUseCase,
    },
  ],
  exports: [
    ICreateGiftRequestUseCase,
    IWithdrawGiftRequestUseCase,
    IListPostRequestsUseCase,
    IAcceptGiftRequestUseCase,
    IAutoSelectDueRecipientsUseCase,
  ],
})
export class GiftRequestModule {}
