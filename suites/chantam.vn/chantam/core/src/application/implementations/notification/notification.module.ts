import {
  ICreateBroadcastUseCase,
  IDispatchNotificationUseCase,
  IListBroadcastsUseCase,
  IListNotificationsUseCase,
  IMarkNotificationsReadUseCase,
  IProcessBroadcastUseCase,
  ISendPendingRemindersUseCase,
} from '@/application/contracts/notification';
import { Global, Module } from '@nestjs/common';
import {
  CreateBroadcastUseCase,
  ListBroadcastsUseCase,
  ProcessBroadcastUseCase,
} from './broadcast.use-cases';
import { DispatchNotificationUseCase } from './dispatch-notification.use-case';
import {
  ListNotificationsUseCase,
  MarkNotificationsReadUseCase,
} from './notification.use-cases';
import { SendPendingRemindersUseCase } from './send-pending-reminders.use-case';

import { NotificationPreferenceUseCases } from './notification-preference.use-cases';
import { PurgeOldNotificationsUseCase } from './purge-old-notifications.use-case';

@Global()
@Module({
  providers: [
    NotificationPreferenceUseCases,
    PurgeOldNotificationsUseCase,
    {
      provide: ICreateBroadcastUseCase,
      useClass: CreateBroadcastUseCase,
    },
    { provide: IListBroadcastsUseCase, useClass: ListBroadcastsUseCase },
    { provide: IProcessBroadcastUseCase, useClass: ProcessBroadcastUseCase },
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
    ICreateBroadcastUseCase,
    IListBroadcastsUseCase,
    IProcessBroadcastUseCase,
    NotificationPreferenceUseCases,
    PurgeOldNotificationsUseCase,
    IDispatchNotificationUseCase,
    IListNotificationsUseCase,
    IMarkNotificationsReadUseCase,
    ISendPendingRemindersUseCase,
  ],
})
export class NotificationUseCaseModule {}
