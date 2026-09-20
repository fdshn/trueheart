import { PointModule } from '@/application/implementations/point/point.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { EntityModule } from '../entity/entity.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { RepositoryModule } from '../repository/repository.module';

/** Không import ControllerModule: DocsModule sẽ chờ một HTTP app CLI không dựng. */
@Module({
  imports: [
    ConfigModule,
    PersistenceModule,
    EntityModule,
    RepositoryModule,
    PointModule,
  ],
})
export class PointCliModule {}
