import { LunarUseCaseModule } from '@/application/implementations/lunar/lunar.module';
import { NotificationUseCaseModule } from '@/application/implementations/notification/notification.module';
import { Module } from '@nestjs/common';
import { CliInfrastructureModule } from './cli-infrastructure.module';

/**
 * Hạ tầng lấy trọn từ `CliInfrastructureModule` — xem ghi chú ở đó về việc vì sao không
 * liệt kê tay từng module.
 *
 * Nạp thêm `NotificationUseCaseModule` dù nó `@Global()`: một module global chỉ global SAU
 * khi đã được nạp vào cây, và cây của CLI này không đi qua `ApplicationModule`.
 */
@Module({
  imports: [
    CliInfrastructureModule,
    LunarUseCaseModule,
    NotificationUseCaseModule,
  ],
})
export class LunarCliModule {}
