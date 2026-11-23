import { IGetPointFeedUseCase } from '@/application/contracts/point';
import { GetPointFeedUseCase } from '@/application/implementations/point/get-point-feed.use-case';
import { Module } from '@nestjs/common';
import { PointFeedController } from './point-feed.controller';
import { PointController } from './point.controller';

/**
 * `GetPointFeedUseCase` đăng ký Ở ĐÂY (chỉ cây API), không ở `PointModule` của tầng ứng dụng:
 * nó cần đệm Redis và bộ đếm tần suất — cây CLI import `PointModule` không có hai thứ đó.
 */
@Module({
  controllers: [PointController, PointFeedController],
  providers: [{ provide: IGetPointFeedUseCase, useClass: GetPointFeedUseCase }],
})
export class PointControllerModule {}
