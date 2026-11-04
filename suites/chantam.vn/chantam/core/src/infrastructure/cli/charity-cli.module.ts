import { CharityProjectModule } from '@/application/implementations/charity-project/charity-project.module';
import { Module } from '@nestjs/common';
import { CliInfrastructureModule } from './cli-infrastructure.module';

/** Hạ tầng lấy trọn từ `CliInfrastructureModule` — xem ghi chú ở đó. */
@Module({
  imports: [CliInfrastructureModule, CharityProjectModule],
})
export class CharityCliModule {}
