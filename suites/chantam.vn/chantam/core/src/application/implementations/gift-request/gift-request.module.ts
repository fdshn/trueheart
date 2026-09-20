import {
  IAcceptGiftRequestUseCase,
  ICreateGiftRequestUseCase,
  IListPostRequestsUseCase,
  IWithdrawGiftRequestUseCase,
} from '@/application/contracts/gift-request';
import { Global, Module } from '@nestjs/common';
import { AcceptGiftRequestUseCase } from './accept-gift-request.use-case';
import { CreateGiftRequestUseCase } from './create-gift-request.use-case';
import { ListPostRequestsUseCase } from './list-post-requests.use-case';
import { WithdrawGiftRequestUseCase } from './withdraw-gift-request.use-case';

@Global()
@Module({
  providers: [
    { provide: ICreateGiftRequestUseCase, useClass: CreateGiftRequestUseCase },
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
  ],
})
export class GiftRequestModule {}
