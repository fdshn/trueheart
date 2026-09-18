import { RankModule } from '@/application/implementations/rank/rank.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { EntityModule } from '../entity/entity.module';
import { GiveActivityModule } from '../give-activity/give-activity.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { RepositoryModule } from '../repository/repository.module';

@Module({
  imports: [
    ConfigModule,
    PersistenceModule,
    EntityModule,
    RepositoryModule,
    GiveActivityModule,
    RankModule,
  ],
})
export class RankEvaluationCliModule {}
