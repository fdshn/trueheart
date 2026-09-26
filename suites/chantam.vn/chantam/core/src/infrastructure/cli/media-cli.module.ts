import { MediaModule } from '@/application/implementations/media/media.module';
import { Module } from '@nestjs/common';
import { CliInfrastructureModule } from './cli-infrastructure.module';

@Module({ imports: [CliInfrastructureModule, MediaModule] })
export class MediaCliModule {}
