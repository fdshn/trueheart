import { IConfig } from '@/domain/ports/config';
import { PersistencyModule } from '@chantam/service.persistency-lib';
import { Module } from '@nestjs/common';
import * as entities from '../entity';
import * as migrations from './migrations';

@Module({
  imports: [
    PersistencyModule.forPostgresAsync({
      inject: [IConfig],
      entities,
      migrations,
      useFactory: (config: IConfig) => config.database.default,
      // Production tự chạy migration còn thiếu lúc khởi động. Ở dev và CI thì
      // chạy tay bằng `npm run migration:run` để lập trình viên kiểm soát được
      // thời điểm schema thay đổi.
      migrationsRun: process.env.NODE_ENV === 'production',
    }),
  ],
})
export class PersistenceModule {}
