import {
  IDispatchNotificationUseCase,
  IListNotificationsUseCase,
  IMarkNotificationsReadUseCase,
} from '@/application/contracts/notification';
import { Global, Module } from '@nestjs/common';
import { DispatchNotificationUseCase } from './dispatch-notification.use-case';
import {
  ListNotificationsUseCase,
  MarkNotificationsReadUseCase,
} from './notification.use-cases';

@Global()
@Module({
  providers: [
    {
      provide: IDispatchNotificationUseCase,
      useClass: DispatchNotificationUseCase,
    },
    { provide: IListNotificationsUseCase, useClass: ListNotificationsUseCase },
    {
      provide: IMarkNotificationsReadUseCase,
      useClass: MarkNotificationsReadUseCase,
    },
  ],
  exports: [
    IDispatchNotificationUseCase,
    IListNotificationsUseCase,
    IMarkNotificationsReadUseCase,
  ],
})
export class NotificationUseCaseModule {}
