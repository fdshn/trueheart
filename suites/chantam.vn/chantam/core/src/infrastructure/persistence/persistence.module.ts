import { IConfig } from '@/domain/ports/config';
import { PersistencyModule } from '@chantam/service.persistency-lib';
import { Module } from '@nestjs/common';
import * as entities from '../entity';

@Module({
  imports: [
    PersistencyModule.forPostgresAsync({
      inject: [IConfig],
      entities,
      useFactory: (config: IConfig) => config.database.default,
      // Chỉ ở development. Production dùng migration — xem docs/ARCHITECTURE.md mục 8.
      synchronize: process.env.NODE_ENV === 'development',
    }),
  ],
})
export class PersistenceModule {}
