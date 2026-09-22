import {
  IListContentReactionsUseCase,
  IRemoveContentReactionUseCase,
  ISetContentReactionUseCase,
} from '@/application/contracts/feed';
import { Global, Module } from '@nestjs/common';
import {
  ListContentReactionsUseCase,
  RemoveContentReactionUseCase,
  SetContentReactionUseCase,
} from './content-reaction.use-cases';

@Global()
@Module({
  providers: [
    {
      provide: ISetContentReactionUseCase,
      useClass: SetContentReactionUseCase,
    },
    {
      provide: IRemoveContentReactionUseCase,
      useClass: RemoveContentReactionUseCase,
    },
    {
      provide: IListContentReactionsUseCase,
      useClass: ListContentReactionsUseCase,
    },
  ],
  exports: [
    ISetContentReactionUseCase,
    IRemoveContentReactionUseCase,
    IListContentReactionsUseCase,
  ],
})
export class FeedModule {}
