import { IGetDiscoveryConfigUseCase } from '@/application/contracts/discovery';
import { IDiscoveryConfigResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { Public } from '@chantam/service.auth-lib';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DiscoveryConfigResponseDto } from '../../dto/discovery';

@Public()
@ApiTags('Khám phá')
@Controller('discovery')
export class DiscoveryController {
  public constructor(
    @Inject(IGetDiscoveryConfigUseCase)
    private readonly getDiscoveryConfigUseCase: IGetDiscoveryConfigUseCase,
  ) {}

  @Get('config')
  @ApiOperation({
    summary: 'Chính sách truy vấn public cho ứng dụng guest',
    description:
      'Trả trần/sàn bán kính tìm kiếm, cỡ trang mặc định và tối đa, cùng danh sách loại bài mà khách chưa đăng nhập xem được. Client gọi endpoint này thay vì hardcode các giới hạn đó — đổi trần ở server là mọi client tự theo, không phải phát hành lại app.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(DiscoveryConfigResponseDto) })
  public async getDiscoveryConfig(): Promise<
    ResponseDto<IDiscoveryConfigResponseDto>
  > {
    const result = await this.getDiscoveryConfigUseCase.handle({});
    return ResponseDto.create<IDiscoveryConfigResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }
}
