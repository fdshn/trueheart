import { IGetCategoryTreeUseCase } from '@/application/contracts/category';
import { IGetCategoryTreeResponseDto } from '@chantam.vn/chantam.core-lib/dto';
import { Public } from '@chantam/service.auth-lib';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetCategoryTreeResponseDto } from '../../dto/category';

@Public()
@ApiTags('Danh mục')
@Controller('api/categories')
export class CategoryController {
  public constructor(
    @Inject(IGetCategoryTreeUseCase)
    private readonly getTree: IGetCategoryTreeUseCase,
  ) {}
  @Get()
  @ApiOperation({ summary: 'Cây danh mục đang hoạt động' })
  @ApiOkResponse({ type: ResponseDto.forApi(GetCategoryTreeResponseDto) })
  public async getCategoryTree(): Promise<
    ResponseDto<IGetCategoryTreeResponseDto>
  > {
    const result = await this.getTree.handle({});
    return ResponseDto.create<IGetCategoryTreeResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }
}
