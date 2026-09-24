import { NotificationUseCaseModule } from '@/application/implementations/notification/notification.module';
import { PointModule } from '@/application/implementations/point/point.module';
import { RankModule } from '@/application/implementations/rank/rank.module';
import { IConfig } from '@/domain/ports/config';
import { AppContextModule } from '@chantam/service.common-lib/modules';
import { LoggerModule } from '@chantam/service.logger-lib';
import { StorageModule } from '@chantam/service.storage-lib';
import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { EntityModule } from '../entity/entity.module';
import { GiveActivityModule } from '../give-activity/give-activity.module';
import { NotificationModule } from '../notification/notification.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { RedisModule } from '../redis/redis.module';
import { RepositoryModule } from '../repository/repository.module';
import { SecurityModule } from '../security/security.module';
import { NoopRealtimeModule } from './noop-realtime.module';

/**
 * Hạ tầng dùng chung cho MỌI CLI.
 *
 * **Vì sao gom một chỗ thay vì để từng CLI tự liệt kê.** Trước đó mỗi
 * `*-cli.module.ts` tự khai bốn module nó đoán là đủ, và cả bảy đều thiếu —
 * `SecurityModule`, `GiveActivityModule`, `RedisModule`... Repository nào thêm
 * một phụ thuộc mới là tất cả CLI chết, mà không CLI nào có test chạy thật nên
 * chuyện đó chỉ lộ ra khi cron đã im lặng cả tháng.
 *
 * Danh sách này bám theo `InfrastructureModule`, TRỪ hai thứ chỉ có nghĩa với
 * một tiến trình HTTP:
 *
 * - `ControllerModule` — `DocsModule` bên trong chờ một HTTP app mà CLI không
 *   bao giờ dựng, nạp vào là treo tiến trình.
 * - `RealtimeModule` / `AuthModule` / `HealthModule` — gateway websocket, guard
 *   và endpoint sức khoẻ đều không có người gọi trong một lần chạy CLI.
 *
 * Kèm ba module TẦNG ỨNG DỤNG mà gần như mọi use case khác đều gọi tới:
 * thông báo, điểm và hạng. Chúng là `@Global()`, nhưng `@Global()` chỉ có hiệu
 * lực sau khi module được import ở đâu đó — không import thì nó không tồn tại,
 * và đó đúng là cái bẫy đã làm bảy CLI cùng chết.
 */
@Module({
  imports: [
    AppContextModule,
    LoggerModule.forRoot(),
    ConfigModule,
    PersistenceModule,
    EntityModule,
    RepositoryModule,
    GiveActivityModule,
    RedisModule,
    SecurityModule,
    NotificationModule,
    StorageModule.forRootAsync({
      inject: [IConfig],
      useFactory: (config: IConfig) => config.storage,
    }),
    NotificationUseCaseModule,
    PointModule,
    RankModule,
    NoopRealtimeModule,
  ],
  exports: [
    AppContextModule,
    ConfigModule,
    PersistenceModule,
    EntityModule,
    RepositoryModule,
    GiveActivityModule,
    RedisModule,
    SecurityModule,
    NotificationModule,
    StorageModule,
    NotificationUseCaseModule,
    PointModule,
    RankModule,
    NoopRealtimeModule,
  ],
})
export class CliInfrastructureModule {}
