import { Module } from '@nestjs/common';
import { ContentCommentController } from './content-comment.controller';
import { ContentReactionController } from './content-reaction.controller';

@Module({
  controllers: [ContentReactionController, ContentCommentController],
})
export class FeedControllerModule {}
