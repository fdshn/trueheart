import { Module } from '@nestjs/common';
import { RankController } from './rank.controller';

@Module({ controllers: [RankController] })
export class RankControllerModule {}
