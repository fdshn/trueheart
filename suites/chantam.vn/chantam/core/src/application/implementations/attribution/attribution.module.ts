import {
  IClaimAttributionUseCase,
  ICreateAttributionLinkUseCase,
  IListAttributionClaimsUseCase,
  IRecordAttributionClickUseCase,
  IResolveAttributionUseCase,
  IReviewAttributionClaimUseCase,
  IRevokeAttributionLinksUseCase,
} from '@/application/contracts/attribution';
import { Global, Module } from '@nestjs/common';
import {
  ClaimAttributionUseCase,
  CreateAttributionLinkUseCase,
  ListAttributionClaimsUseCase,
  RecordAttributionClickUseCase,
  ResolveAttributionUseCase,
  ReviewAttributionClaimUseCase,
  RevokeAttributionLinksUseCase,
} from './attribution.use-cases';

/** `@Global()` như mọi feature module của tầng application — thiếu là DI hỏng lúc boot. */
@Global()
@Module({
  providers: [
    {
      provide: ICreateAttributionLinkUseCase,
      useClass: CreateAttributionLinkUseCase,
    },
    {
      provide: IRecordAttributionClickUseCase,
      useClass: RecordAttributionClickUseCase,
    },
    {
      provide: IResolveAttributionUseCase,
      useClass: ResolveAttributionUseCase,
    },
    { provide: IClaimAttributionUseCase, useClass: ClaimAttributionUseCase },
    {
      provide: IListAttributionClaimsUseCase,
      useClass: ListAttributionClaimsUseCase,
    },
    {
      provide: IReviewAttributionClaimUseCase,
      useClass: ReviewAttributionClaimUseCase,
    },
    {
      provide: IRevokeAttributionLinksUseCase,
      useClass: RevokeAttributionLinksUseCase,
    },
  ],
  exports: [
    ICreateAttributionLinkUseCase,
    IRecordAttributionClickUseCase,
    IResolveAttributionUseCase,
    IClaimAttributionUseCase,
    IListAttributionClaimsUseCase,
    IReviewAttributionClaimUseCase,
    IRevokeAttributionLinksUseCase,
  ],
})
export class AttributionModule {}
