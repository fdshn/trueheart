import {
  IGetAdminPostUseCase,
  IListAdminPostsUseCase,
  IModerateAdminPostUseCase,
} from '@/application/contracts/post';
import {
  PostInvalidStateException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AdminPostParamsDto,
  GetAdminPostResponseDto,
  ListAdminPostsQueryDto,
  ListAdminPostsResponseDto,
  ModerateAdminPostBodyDto,
  ModerateAdminPostResponseDto,
} from '../../dto/post/admin-post.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Admin - Bài đăng')
@ApiBearerAuth()
@Controller('admin/posts')
export class AdminPostController {
  public constructor(
    @Inject(IListAdminPostsUseCase)
    private readonly listAdminPostsUseCase: IListAdminPostsUseCase,
    @Inject(IGetAdminPostUseCase)
    private readonly getAdminPostUseCase: IGetAdminPostUseCase,
    @Inject(IModerateAdminPostUseCase)
    private readonly moderateAdminPostUseCase: IModerateAdminPostUseCase,
  ) {}

  @Get()
  @RequiresPermission('post.read')
  @ApiOperation({
    summary: 'Hàng đợi bài đăng cho CMS',
    description:
      'Không lọc sẵn theo trạng thái nào — bài lên thẳng nên không còn hàng đợi duyệt. Hỗ trợ lọc trạng thái, loại bài, category, author và keyword.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListAdminPostsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async listAdminPosts(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListAdminPostsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listAdminPostsUseCase.handle({
          actorUserId: principal.userId,
          status: query.status,
          postType: query.postType,
          categoryId: query.categoryId,
          authorId: query.authorId,
          keyword: query.keyword,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }

  @Get(':postId')
  @RequiresPermission('post.read')
  @ApiOperation({ summary: 'Chi tiết bài đăng dành cho moderator' })
  @ApiOkResponse({ type: ResponseDto.forApi(GetAdminPostResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [PostNotFoundException, '4182a141-a5c5-5c25-92ab-0d4488158e8f'],
  )
  public async getAdminPost(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AdminPostParamsDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getAdminPostUseCase.handle({
          actorUserId: principal.userId,
          postId: params.postId,
        }),
      )
      .build();
  }

  @Patch(':postId/moderation')
  @RequiresPermission('post.moderate')
  @ApiOperation({
    summary: 'Duyệt hoặc từ chối bài đăng',
    description:
      'Hậu kiểm: gỡ một bài đang hiện (`REJECTED`) hoặc trả lại bài đã gỡ (`PUBLISHED`). KHÔNG chạm được vào bài đang có giao dịch sống (`RESERVED`) hay đã đóng — trả 409. Bài trả lại giữ nguyên hạn cũ, không được cộng thêm ba tháng. `reason` bắt buộc, ghi cùng before/after vào audit log.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ModerateAdminPostResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ValidationFailedException, ['reason không được để trống']],
    PostInvalidStateException,
  )
  public async moderateAdminPost(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AdminPostParamsDto,
    @Body() body: ModerateAdminPostBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.moderateAdminPostUseCase.handle({
          actorUserId: principal.userId,
          postId: params.postId,
          moderation: body.moderation,
        }),
      )
      .build();
  }
}
