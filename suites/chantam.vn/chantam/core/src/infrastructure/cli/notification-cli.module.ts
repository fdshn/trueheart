import { ReviewModule } from '@/application/implementations/review/review.module';
import { Module } from '@nestjs/common';
import { CliInfrastructureModule } from './cli-infrastructure.module';

/**
 * Hạ tầng lấy trọn từ `CliInfrastructureModule` — xem ghi chú ở đó về việc vì
 * sao không liệt kê tay từng module.
 *
 * `ReviewModule` cần vì lời nhắc đánh giá đọc qua `ITransactionReviewRepository`;
 * thông báo, điểm và hạng đã nằm trong `CliInfrastructureModule`.
 */
@Module({
  imports: [CliInfrastructureModule, ReviewModule],
})
export class NotificationCliModule {}
