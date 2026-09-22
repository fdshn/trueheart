import { Module } from '@nestjs/common';
import { ContentReactionController } from './content-reaction.controller';

@Module({ controllers: [ContentReactionController] })
export class FeedControllerModule {}
