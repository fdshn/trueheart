import {
  IGetLunarTodayUseCase,
  IListLunarHolidaysUseCase,
  INotifyLunarObservanceUseCase,
  IReplaceLunarHolidaysUseCase,
} from '@/application/contracts/lunar';
import { Global, Module } from '@nestjs/common';
import {
  GetLunarTodayUseCase,
  ListLunarHolidaysUseCase,
  ReplaceLunarHolidaysUseCase,
} from './lunar.use-cases';
import { NotifyLunarObservanceUseCase } from './notify-lunar-observance.use-case';

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
    {
      provide: INotifyLunarObservanceUseCase,
      useClass: NotifyLunarObservanceUseCase,
    },
  ],
  exports: [
    IGetLunarTodayUseCase,
    IListLunarHolidaysUseCase,
    IReplaceLunarHolidaysUseCase,
    INotifyLunarObservanceUseCase,
  ],
})
export class LunarUseCaseModule {}
