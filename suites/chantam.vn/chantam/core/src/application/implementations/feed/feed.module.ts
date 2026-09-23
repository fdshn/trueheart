import {
  ICreateCommentUseCase,
  IEditCommentUseCase,
  IListCommentRepliesUseCase,
  IListCommentsUseCase,
  IListContentReactionsUseCase,
  IRecordContentShareUseCase,
  IRemoveCommentUseCase,
  IRemoveContentReactionUseCase,
  IRequestCommentMediaUploadUseCase,
  ISetContentReactionUseCase,
} from '@/application/contracts/feed';
import { Global, Module } from '@nestjs/common';
import {
  CreateCommentUseCase,
  EditCommentUseCase,
  ListCommentRepliesUseCase,
  ListCommentsUseCase,
  RemoveCommentUseCase,
  RequestCommentMediaUploadUseCase,
} from './content-comment.use-cases';
import {
  ListContentReactionsUseCase,
  RemoveContentReactionUseCase,
  SetContentReactionUseCase,
} from './content-reaction.use-cases';
import { RecordContentShareUseCase } from './content-share.use-cases';

@Global()
@Module({
  providers: [
    { provide: ICreateCommentUseCase, useClass: CreateCommentUseCase },
    {
      provide: IRequestCommentMediaUploadUseCase,
      useClass: RequestCommentMediaUploadUseCase,
    },
    { provide: IEditCommentUseCase, useClass: EditCommentUseCase },
    { provide: IRemoveCommentUseCase, useClass: RemoveCommentUseCase },
    { provide: IListCommentsUseCase, useClass: ListCommentsUseCase },
    {
      provide: IListCommentRepliesUseCase,
      useClass: ListCommentRepliesUseCase,
    },
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
    {
      provide: IRecordContentShareUseCase,
      useClass: RecordContentShareUseCase,
    },
  ],
  exports: [
    ICreateCommentUseCase,
    IRequestCommentMediaUploadUseCase,
    IEditCommentUseCase,
    IRemoveCommentUseCase,
    IListCommentsUseCase,
    IListCommentRepliesUseCase,
    ISetContentReactionUseCase,
    IRemoveContentReactionUseCase,
    IListContentReactionsUseCase,
    IRecordContentShareUseCase,
  ],
})
export class FeedModule {}
