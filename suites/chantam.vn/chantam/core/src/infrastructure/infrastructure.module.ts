import { IConfig } from '@/domain/ports/config';
import { AuthModule } from '@chantam/service.auth-lib';
import { AppContextModule } from '@chantam/service.common-lib/modules';
import { HealthModule } from '@chantam/service.health-lib';
import { LoggerModule } from '@chantam/service.logger-lib';
import { StorageModule } from '@chantam/service.storage-lib';
import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { ConfigModule } from './config/config.module';
import { ControllerModule } from './controller/controller.module';
import { EntityModule } from './entity/entity.module';
import { NotificationModule } from './notification/notification.module';
import { PersistenceModule } from './persistence/persistence.module';
import { IRedisClient, RedisModule } from './redis/redis.module';
import { RepositoryModule } from './repository/repository.module';
import { SecurityModule } from './security/security.module';
import { RedisTokenDenyList } from './security/token-deny-list';

@Module({
  imports: [
    AppContextModule,
    LoggerModule.forRoot(),
    ConfigModule,
    PersistenceModule,
    EntityModule,
    RepositoryModule,
    RedisModule,
    SecurityModule,
    NotificationModule,
    StorageModule.forRootAsync({
      inject: [IConfig],
      useFactory: (config: IConfig) => config.storage,
    }),
    AuthModule.forRootAsync({
      inject: [IConfig],
      useFactory: (config: IConfig) => ({
        jwtSecret: config.auth.jwtSecret,
        accessTtlSeconds: config.auth.accessTtlSeconds,
        refreshTtlSeconds: config.auth.refreshTtlSeconds,
        bcryptRounds: config.auth.bcryptRounds,
      }),
      // Không có phần này thì "thu hồi toàn bộ phiên" chỉ đúng với refresh
      // token; access token cũ vẫn sống tới 15 phút.
      denyList: {
        inject: [IRedisClient, IConfig],
        useFactory: (redis: Redis, config: IConfig) =>
          new RedisTokenDenyList(redis, config.auth.accessTtlSeconds),
      },
    }),
    ControllerModule,
    HealthModule.forRootAsync({
      inject: [IConfig, getDataSourceToken()],
      useFactory: (config: IConfig, dataSource: DataSource) => ({
        version: config.version,
        indicators: [
          async () => {
            // Không chỉ hỏi `isInitialized` — kết nối có thể "còn sống" trên
            // giấy tờ nhưng thực tế đã rớt. Một truy vấn rẻ tiền mới nói thật.
            try {
              await dataSource.query('SELECT 1');

              return { name: 'postgres', healthy: true };
            } catch (error) {
              return {
                name: 'postgres',
                healthy: false,
                detail: error instanceof Error ? error.message : String(error),
              };
            }
          },
        ],
      }),
    }),
  ],
})
export class InfrastructureModule {}
