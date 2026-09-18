import {
  ICreateCategoryUseCase,
  IGetCategoryTreeUseCase,
  IUpdateCategoryUseCase,
} from '@/application/contracts/category';
import {
  ICreateCategoryResponseDto,
  IGetCategoryTreeResponseDto,
  IUpdateCategoryResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import { CurrentUser, IAuthPrincipal, Public } from '@chantam/service.auth-lib';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateCategoryBodyDto,
  CreateCategoryResponseDto,
  GetCategoryTreeResponseDto,
  UpdateCategoryBodyDto,
  UpdateCategoryParamsDto,
  UpdateCategoryResponseDto,
} from '../../dto/category';

@ApiTags('Danh mục')
@Controller('categories')
export class CategoryController {
  public constructor(
    @Inject(IGetCategoryTreeUseCase)
    private readonly getTree: IGetCategoryTreeUseCase,
    @Inject(ICreateCategoryUseCase)
    private readonly createCategory: ICreateCategoryUseCase,
    @Inject(IUpdateCategoryUseCase)
    private readonly updateCategory: IUpdateCategoryUseCase,
  ) {}

  @Public()
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

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Tạo danh mục (allowlist tạm thời, M6 thay bằng Admin CMS)',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CreateCategoryResponseDto) })
  public async create(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: CreateCategoryBodyDto,
  ): Promise<ResponseDto<ICreateCategoryResponseDto>> {
    const result = await this.createCategory.handle({
      ...body,
      userId: principal.userId,
      username: principal.username,
    });
    return ResponseDto.create<ICreateCategoryResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Patch(':categoryId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sửa/tắt danh mục, không xoá cứng' })
  @ApiOkResponse({ type: ResponseDto.forApi(UpdateCategoryResponseDto) })
  public async update(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: UpdateCategoryParamsDto,
    @Body() body: UpdateCategoryBodyDto,
  ): Promise<ResponseDto<IUpdateCategoryResponseDto>> {
    const result = await this.updateCategory.handle({
      ...params,
      ...body,
      userId: principal.userId,
      username: principal.username,
    });
    return ResponseDto.create<IUpdateCategoryResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }
}
