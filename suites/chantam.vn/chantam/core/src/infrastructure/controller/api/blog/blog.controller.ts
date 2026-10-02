import {
  ICreateBlogUseCase,
  IDeleteBlogUseCase,
  IGetPublicBlogUseCase,
  IListAdminBlogsUseCase,
  IListPublicBlogsUseCase,
  IUpdateBlogUseCase,
} from '@/application/contracts/blog';
import { BlogNotFoundException } from '@/domain/exceptions';
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
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
  BlogDetailResponseDto,
  DeleteBlogResponseDto,
  ListBlogsQueryDto,
  ListBlogsResponseDto,
  WriteBlogBodyDto,
} from '../../dto/blog/blog.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Blog & Tin tức')
@ApiBearerAuth()
@Controller('admin')
export class AdminBlogController {
  public constructor(
    @Inject(IListAdminBlogsUseCase)
    private readonly listUseCase: IListAdminBlogsUseCase,
    @Inject(ICreateBlogUseCase)
    private readonly createUseCase: ICreateBlogUseCase,
    @Inject(IUpdateBlogUseCase)
    private readonly updateUseCase: IUpdateBlogUseCase,
    @Inject(IDeleteBlogUseCase)
    private readonly deleteUseCase: IDeleteBlogUseCase,
  ) {}

  @Get('blogs')
  @RequiresPermission('blog.read')
  @ApiOperation({
    summary: 'Danh sách bài viết, gồm cả bản nháp',
    description:
      'Sắp theo `publishedAt` giảm dần, và bản nháp dùng `createdAt` làm dự phòng — nếu ' +
      'không thì mọi nháp dồn xuống cuối với `null`, và Admin vừa lưu nháp xong không ' +
      'thấy nó ở đâu.\n\n' +
      'KHÔNG trả `contentHtml`: một trang 20 bài × 200KB nội dung là 4MB cho một màn ' +
      'hình chỉ hiện tiêu đề và tóm tắt.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListBlogsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async list(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListBlogsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          actorUserId: principal.userId,
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
          category: query.category,
        }),
      )
      .build();
  }

  @Post('blogs')
  @RequiresPermission('blog.manage')
  @ApiOperation({
    summary: 'Soạn bài viết mới',
    description:
      '`contentHtml` được LỌC trước khi lưu, và cột chứa bản đã sạch. Lọc ở tầng ghi chứ ' +
      'không lọc lúc đọc: một đường đọc quên lọc cũng không làm lộ gì, và một bài dài ' +
      'không trả giá lọc lại mỗi lượt xem.\n\n' +
      'Giá trị bị bỏ **không** trả 422 — thẻ lạ, `on*`, `style`, `href` không phải ' +
      '`https` đều bị loại im lặng, và response trả lại `contentHtml` đã lọc nên người ' +
      'soạn thấy ngay thứ mình dán có được giữ không.\n\n' +
      'Hai chỗ TỪ CHỐI: `slug` đã có bài khác dùng; và xuất bản mà nội dung lọc xong ' +
      'không còn chữ nào (dán toàn `<script>` là ca thật của chuyện này) hoặc thiếu ảnh bìa.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(BlogDetailResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [
      ValidationFailedException,
      ['contentHtml không còn nội dung nào sau khi lọc HTML'],
    ],
  )
  public async create(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: WriteBlogBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.createUseCase.handle({
          actorUserId: principal.userId,
          ...body.blog,
        }),
      )
      .build();
  }

  @Put('blogs/:blogId')
  @RequiresPermission('blog.manage')
  @ApiOperation({
    summary: 'Sửa bài viết',
    description:
      'Thay toàn bộ nội dung, không vá từng trường.\n\n' +
      'Sửa một bài ĐANG công khai **giữ nguyên `publishedAt` cũ** — sửa một typo không ' +
      'được đẩy bài lên đầu danh sách như bài mới. Rút xuống rồi đăng lại thì có mốc mới.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(BlogDetailResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [BlogNotFoundException],
    [ValidationFailedException, ['title phải có ít nhất 3 ký tự']],
  )
  public async update(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('blogId', ParseUUIDPipe) blogId: string,
    @Body() body: WriteBlogBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.updateUseCase.handle({
          actorUserId: principal.userId,
          blogId,
          ...body.blog,
        }),
      )
      .build();
  }

  @Delete('blogs/:blogId')
  @RequiresPermission('blog.manage')
  @ApiOperation({
    summary: 'Xoá bài viết',
    description:
      'Xoá **MỀM**. Một bài đã xuất bản có link ngoài trỏ vào, và `slug` vẫn phải giữ ' +
      'chỗ để bài sau không chiếm lại cùng đường dẫn rồi hiện ra một nội dung khác hẳn.\n\n' +
      'Đồng thời tắt `isPublished` và xoá `publishedAt`, nên bài biến khỏi mọi đường công khai ngay.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(DeleteBlogResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [BlogNotFoundException],
  )
  public async remove(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('blogId', ParseUUIDPipe) blogId: string,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.deleteUseCase.handle({
          actorUserId: principal.userId,
          blogId,
        }),
      )
      .build();
  }
}

@ApiTags('Blog & Tin tức')
@Controller('blogs')
export class BlogController {
  public constructor(
    @Inject(IListPublicBlogsUseCase)
    private readonly listUseCase: IListPublicBlogsUseCase,
    @Inject(IGetPublicBlogUseCase)
    private readonly getUseCase: IGetPublicBlogUseCase,
  ) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Danh sách bài viết đã xuất bản',
    description:
      'Công khai, không cần token. Chỉ bài `isPublished` và chưa xoá. Lọc theo chuyên ' +
      'mục qua `category`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListBlogsResponseDto) })
  public async list(@Query() query: ListBlogsQueryDto) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
          category: query.category,
        }),
      )
      .build();
  }

  @Get(':idOrSlug')
  @Public()
  @ApiOperation({
    summary: 'Một bài viết, theo slug hoặc id',
    description:
      'Đặc tả gọi đường này là `GET /blogs/:id`, nhưng link chia sẻ của một bài viết ' +
      'dùng slug. Nhận cả hai: trông như UUID thì tra theo id, còn lại tra theo slug — ' +
      'đỡ phải thêm một endpoint thứ hai cho cùng một việc.\n\n' +
      'Tra bằng id cũng CHỈ trả bài đã xuất bản: đường này công khai, nên một bản nháp ' +
      'đọc được bằng id là bài chưa duyệt lọt ra ngoài.\n\n' +
      'Mỗi lượt gọi tăng `viewCount` một. Lượt tăng đó KHÔNG đụng `updatedAt`, nếu không ' +
      'mọi bài đọc nhiều sẽ luôn hiện "vừa cập nhật" và Admin mất cách biết bài nào thật ' +
      'sự được sửa.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(BlogDetailResponseDto) })
  @ApiErrorResponses([BlogNotFoundException])
  public async getOne(@Param('idOrSlug') idOrSlug: string) {
    return ResponseDto.create()
      .succeed()
      .attach(await this.getUseCase.handle({ idOrSlug }))
      .build();
  }
}
