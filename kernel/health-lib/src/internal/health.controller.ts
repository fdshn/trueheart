import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { IHealthReport } from './types';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Trạng thái service và các phụ thuộc' })
  public async getHealth(): Promise<ResponseDto<IHealthReport>> {
    const report = await this.healthService.check();

    return ResponseDto.create<IHealthReport>().succeed().attach(report).build();
  }
}
