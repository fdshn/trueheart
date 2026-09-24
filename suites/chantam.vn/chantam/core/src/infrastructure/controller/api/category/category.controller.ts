import {
  ICreateCategoryUseCase,
  IGetCategoryTreeUseCase,
  IUpdateCategoryUseCase,
} from '@/application/contracts/category';
import {
  CategoryNotFoundException,
  CategorySlugTakenException,
} from '@/domain/exceptions';
import {
  ICreateCategoryResponseDto,
  IGetCategoryTreeResponseDto,
  IUpdateCategoryResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
  Public,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
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
  GetCategoryTreeQueryDto,
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
  @ApiOperation({
    summary: 'Cây danh mục đang hoạt động',
    description:
      'Lọc theo phân hệ bằng `?postType=` để lấy đúng danh mục cho form đăng tin hoặc bộ lọc. Bỏ trống trả cả cây.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetCategoryTreeResponseDto) })
  @ApiErrorResponses([
    ValidationFailedException,
    ['postType: postType must be a valid enum value'],
  ])
  public async getCategoryTree(
    @Query() query: GetCategoryTreeQueryDto,
  ): Promise<ResponseDto<IGetCategoryTreeResponseDto>> {
    const result = await this.getTree.handle({ postType: query.postType });
    return ResponseDto.create<IGetCategoryTreeResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Tạo danh mục',
    description:
      'Cần quyền `category.manage` trong Admin CMS. Slug bỏ trống thì tự sinh từ tên. `postTypes` bỏ trống thì danh mục dùng được cho mọi loại bài.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CreateCategoryResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ValidationFailedException, ['category.name: name should not be empty']],
    [ForbiddenException],
    [CategorySlugTakenException, 'sach'],
    CategoryNotFoundException,
  )
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
  @ApiOperation({
    summary: 'Sửa hoặc tắt danh mục',
    description:
      'KHÔNG xoá cứng: danh mục đang có bài dùng mà xoá thì những bài đó mất danh mục. Muốn ẩn thì đặt `isActive: false` — bài cũ giữ nguyên liên kết, form đăng mới không còn thấy nó nữa.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(UpdateCategoryResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ValidationFailedException, ['categoryId: categoryId must be a UUID']],
    [ForbiddenException],
    CategoryNotFoundException,
    [CategorySlugTakenException, 'sach'],
  )
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
