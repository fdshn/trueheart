import {
  ICreateGiftRequestUseCase,
  IListPostRequestsUseCase,
  IWithdrawGiftRequestUseCase,
} from '@/application/contracts/gift-request';
import { Global, Module } from '@nestjs/common';
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
  ],
  exports: [
    ICreateGiftRequestUseCase,
    IWithdrawGiftRequestUseCase,
    IListPostRequestsUseCase,
  ],
})
export class GiftRequestModule {}
