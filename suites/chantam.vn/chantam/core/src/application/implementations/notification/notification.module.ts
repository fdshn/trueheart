import {
  IDispatchNotificationUseCase,
  IListNotificationsUseCase,
  IMarkNotificationsReadUseCase,
  ISendPendingRemindersUseCase,
} from '@/application/contracts/notification';
import { Global, Module } from '@nestjs/common';
import { DispatchNotificationUseCase } from './dispatch-notification.use-case';
import {
  ListNotificationsUseCase,
  MarkNotificationsReadUseCase,
} from './notification.use-cases';
import { SendPendingRemindersUseCase } from './send-pending-reminders.use-case';

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
    {
      provide: ISendPendingRemindersUseCase,
      useClass: SendPendingRemindersUseCase,
    },
  ],
  exports: [
    IDispatchNotificationUseCase,
    IListNotificationsUseCase,
    IMarkNotificationsReadUseCase,
    ISendPendingRemindersUseCase,
  ],
})
export class NotificationUseCaseModule {}
