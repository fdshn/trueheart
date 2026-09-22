import { Module } from '@nestjs/common';
import { ContentCommentController } from './content-comment.controller';
import { ContentReactionController } from './content-reaction.controller';
import { ContentShareController } from './content-share.controller';

@Module({
  controllers: [
    ContentReactionController,
    ContentCommentController,
    ContentShareController,
  ],
})
export class FeedControllerModule {}
