import {
  IGetLunarTodayUseCase,
  IListLunarHolidaysUseCase,
  IReplaceLunarHolidaysUseCase,
} from '@/application/contracts/lunar';
import { Global, Module } from '@nestjs/common';
import {
  GetLunarTodayUseCase,
  ListLunarHolidaysUseCase,
  ReplaceLunarHolidaysUseCase,
} from './lunar.use-cases';

/** `@Global()` như mọi feature module khác — xem ghi chú ở `home-campaign.module.ts`. */
@Global()
@Module({
  providers: [
    { provide: IGetLunarTodayUseCase, useClass: GetLunarTodayUseCase },
    { provide: IListLunarHolidaysUseCase, useClass: ListLunarHolidaysUseCase },
    {
      provide: IReplaceLunarHolidaysUseCase,
      useClass: ReplaceLunarHolidaysUseCase,
    },
  ],
  exports: [
    IGetLunarTodayUseCase,
    IListLunarHolidaysUseCase,
    IReplaceLunarHolidaysUseCase,
  ],
})
export class LunarUseCaseModule {}
