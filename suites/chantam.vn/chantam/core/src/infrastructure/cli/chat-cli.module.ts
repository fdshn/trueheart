import { ChatModule } from '@/application/implementations/chat/chat.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { EntityModule } from '../entity/entity.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { RepositoryModule } from '../repository/repository.module';

/**
 * Cố ý KHÔNG import ControllerModule: `DocsModule` chờ một HTTP app mà CLI
 * không bao giờ dựng, nên nạp cả cây controller là treo tiến trình.
 */
@Module({
  imports: [
    ConfigModule,
    PersistenceModule,
    EntityModule,
    RepositoryModule,
    ChatModule,
  ],
})
export class ChatCliModule {}
