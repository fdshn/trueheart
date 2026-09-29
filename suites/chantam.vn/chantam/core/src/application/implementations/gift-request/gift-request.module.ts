import {
  IAcceptGiftRequestUseCase,
  IAutoSelectDueRecipientsUseCase,
  ICreateGiftRequestUseCase,
  IGetRedemptionQuoteUseCase,
  IListMyGiftRequestsUseCase,
  IListPostRequestsUseCase,
  IRedeemPostWithPointsUseCase,
  IRejectGiftRequestUseCase,
  IWithdrawGiftRequestUseCase,
} from '@/application/contracts/gift-request';
import { Global, Module } from '@nestjs/common';
import { AcceptGiftRequestUseCase } from './accept-gift-request.use-case';
import { AcceptedRequestNotifier } from './accepted-request.notifier';
import { AutoSelectDueRecipientsUseCase } from './auto-select-due-recipients.use-case';
import { CloseOpenRequestsService } from './close-open-requests.service';
import { CreateGiftRequestUseCase } from './create-gift-request.use-case';
import { ListPostRequestsUseCase } from './list-post-requests.use-case';
import {
  ListMyGiftRequestsUseCase,
  RejectGiftRequestUseCase,
} from './my-gift-requests.use-cases';
import { RedeemPostWithPointsUseCase } from './redeem-post-with-points.use-case';
import { GetRedemptionQuoteUseCase } from './redemption-quote.use-case';
import { RequestLifecycleNotifier } from './request-lifecycle.notifier';
import { WithdrawGiftRequestUseCase } from './withdraw-gift-request.use-case';

@Global()
@Module({
  providers: [
    AcceptedRequestNotifier,
    RequestLifecycleNotifier,
    CloseOpenRequestsService,
    {
      provide: IListMyGiftRequestsUseCase,
      useClass: ListMyGiftRequestsUseCase,
    },
    { provide: IRejectGiftRequestUseCase, useClass: RejectGiftRequestUseCase },
    { provide: ICreateGiftRequestUseCase, useClass: CreateGiftRequestUseCase },
    {
      provide: IAutoSelectDueRecipientsUseCase,
      useClass: AutoSelectDueRecipientsUseCase,
    },
    {
      provide: IRedeemPostWithPointsUseCase,
      useClass: RedeemPostWithPointsUseCase,
    },
    {
      provide: IGetRedemptionQuoteUseCase,
      useClass: GetRedemptionQuoteUseCase,
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
    CloseOpenRequestsService,
    IListMyGiftRequestsUseCase,
    IRejectGiftRequestUseCase,
    ICreateGiftRequestUseCase,
    IWithdrawGiftRequestUseCase,
    IListPostRequestsUseCase,
    IAcceptGiftRequestUseCase,
    IAutoSelectDueRecipientsUseCase,
    IRedeemPostWithPointsUseCase,
    IGetRedemptionQuoteUseCase,
  ],
})
export class GiftRequestModule {}
