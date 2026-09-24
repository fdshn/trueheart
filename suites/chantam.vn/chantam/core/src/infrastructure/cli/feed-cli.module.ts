import { FeedModule } from '@/application/implementations/feed/feed.module';
import { Module } from '@nestjs/common';
import { CliInfrastructureModule } from './cli-infrastructure.module';

/**
 * Hạ tầng lấy trọn từ `CliInfrastructureModule` — xem ghi chú ở đó về việc vì
 * sao không liệt kê tay từng module.
 */
@Module({
  imports: [CliInfrastructureModule, FeedModule],
})
export class FeedCliModule {}
