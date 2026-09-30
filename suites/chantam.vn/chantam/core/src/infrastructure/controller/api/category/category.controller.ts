import {
  ICreateCategoryUseCase,
  IGetCategoryTreeUseCase,
  IMergeCategoryResult,
  IMergeCategoryUseCase,
  IUpdateCategoryUseCase,
} from '@/application/contracts/category';
import {
  CategoryDepthExceededException,
  CategoryInUseException,
  CategoryMergedCannotReopenException,
  CategoryMergeInvalidException,
  CategoryNotFoundException,
  CategoryParentCycleException,
  CategoryPostTypeNotAllowedException,
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
  MergeCategoryBodyDto,
  MergeCategoryResponseDto,
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
    @Inject(IMergeCategoryUseCase)
    private readonly mergeCategory: IMergeCategoryUseCase,
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

  @Post(':categoryId/merge')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gộp danh mục này vào danh mục khác',
    description:
      'Cần `category.manage`. Chuyển toàn bộ bài và danh mục con sang đích rồi TẮT nguồn — không xoá, vì bài cũ vẫn cần đọc được tên để hiển thị lịch sử. `merged_into_id` ghi nguồn đã đi đâu, nên sau này tra được "tắt vì gộp" khác với "Admin tắt tay". Tất cả trong MỘT transaction: tách ra thì một lần chết giữa chừng để lại nguồn đã tắt mà bài vẫn ở đó. Từ chối khi đích nằm trong nhánh con của nguồn (sẽ tạo vòng), khi đích không nhận đủ loại bài mà nguồn đang nhận, hoặc khi nhánh sau gộp vượt giới hạn độ sâu.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(MergeCategoryResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    CategoryNotFoundException,
    [CategoryMergeInvalidException, ['không gộp một danh mục vào chính nó']],
    [CategoryDepthExceededException, [4]],
    [CategoryPostTypeNotAllowedException, ['WANTED', 'OFFER']],
  )
  public async merge(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: UpdateCategoryParamsDto,
    @Body() body: MergeCategoryBodyDto,
  ): Promise<ResponseDto<IMergeCategoryResult>> {
    const result = await this.mergeCategory.handle({
      categoryId: params.categoryId,
      merge: body.merge,
      userId: principal.userId,
    });

    return ResponseDto.create<IMergeCategoryResult>()
      .succeed()
      .attach(result as never)
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
    [CategoryParentCycleException, ['Điện thoại']],
    [CategoryInUseException, [34]],
    [CategoryDepthExceededException, [4]],
    [CategoryMergedCannotReopenException, ['Đồ gia dụng', 'Gia dụng']],
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
