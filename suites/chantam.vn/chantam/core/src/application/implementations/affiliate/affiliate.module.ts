import {
  IGetAffiliateEventRewardsUseCase,
  IGetAffiliatePolicyUseCase,
  IListAffiliateEventsUseCase,
  IPublishAffiliatePolicyUseCase,
  IReverseAffiliateEventUseCase,
} from '@/application/contracts/affiliate';
import { Global, Module } from '@nestjs/common';
import {
  GetAffiliateEventRewardsUseCase,
  GetAffiliatePolicyUseCase,
  ListAffiliateEventsUseCase,
  PublishAffiliatePolicyUseCase,
  ReverseAffiliateEventUseCase,
} from './affiliate.use-cases';

@Global()
@Module({
  providers: [
    {
      provide: IGetAffiliatePolicyUseCase,
      useClass: GetAffiliatePolicyUseCase,
    },
    {
      provide: IPublishAffiliatePolicyUseCase,
      useClass: PublishAffiliatePolicyUseCase,
    },
    {
      provide: IListAffiliateEventsUseCase,
      useClass: ListAffiliateEventsUseCase,
    },
    {
      provide: IGetAffiliateEventRewardsUseCase,
      useClass: GetAffiliateEventRewardsUseCase,
    },
    {
      provide: IReverseAffiliateEventUseCase,
      useClass: ReverseAffiliateEventUseCase,
    },
  ],
  exports: [
    IGetAffiliatePolicyUseCase,
    IPublishAffiliatePolicyUseCase,
    IListAffiliateEventsUseCase,
    IGetAffiliateEventRewardsUseCase,
    IReverseAffiliateEventUseCase,
  ],
})
export class AffiliateModule {}
