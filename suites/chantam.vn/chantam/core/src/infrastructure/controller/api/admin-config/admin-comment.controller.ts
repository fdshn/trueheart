import {
  ICountPendingAdminCommentsUseCase,
  IListAdminCommentsUseCase,
  IModerateAdminCommentUseCase,
} from '@/application/contracts/admin-config';
import { ContentCommentNotFoundException } from '@/domain/exceptions';
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
  AdminCommentParamsDto,
  ListAdminCommentsQueryDto,
  ListAdminCommentsResponseDto,
  ModerateAdminCommentBodyDto,
  ModerateAdminCommentResponseDto,
  PendingAdminCommentsResponseDto,
} from '../../dto/admin-config/admin-comment.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Quản trị — bình luận')
@ApiBearerAuth()
@Controller('admin/comments')
export class AdminCommentController {
  public constructor(
    @Inject(IListAdminCommentsUseCase)
    private readonly listAdminCommentsUseCase: IListAdminCommentsUseCase,
    @Inject(IModerateAdminCommentUseCase)
    private readonly moderateAdminCommentUseCase: IModerateAdminCommentUseCase,
    @Inject(ICountPendingAdminCommentsUseCase)
    private readonly countPendingAdminCommentsUseCase: ICountPendingAdminCommentsUseCase,
  ) {}

  // Khai báo TRƯỚC mọi route có tham số đường dẫn: `pending-count` là một chuỗi
  // cố định, và route `:commentId` đứng trước sẽ nuốt nó.
  @Get('pending-count')
  @RequiresPermission('post.moderate')
  @ApiOperation({
    summary: 'Số bình luận đang chờ duyệt',
    description:
      'Một con số cho huy hiệu trên menu CMS. Hàng đợi có cửa nhưng không có chuông — Admin không mở màn hình ra thì một câu chửi nằm chờ ba ngày cũng không ai hay. Bắn thông báo cho từng bình luận thì ngược lại: nội dung bẩn đến theo đợt, và Admin sẽ tắt thông báo ngay sau đợt đầu tiên.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(PendingAdminCommentsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async countPending(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.countPendingAdminCommentsUseCase.handle({
          actorUserId: principal.userId,
        }),
      )
      .build();
  }

  @Get()
  @RequiresPermission('post.moderate')
  @ApiOperation({
    summary: 'Hàng đợi bình luận chờ duyệt',
    description:
      'Mặc định trả mọi bình luận chưa bị gỡ; lọc `status=PENDING_REVIEW` để lấy đúng hàng đợi của bộ lọc từ ngữ. Mỗi dòng kèm tiêu đề bài và từ ngữ bị bắt — một câu chửi chỉ có nghĩa khi biết nó nằm dưới bài nào.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListAdminCommentsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, [ForbiddenException])
  public async listComments(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListAdminCommentsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listAdminCommentsUseCase.handle({
          actorUserId: principal.userId,
          status: query.status,
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 20,
        }),
      )
      .build();
  }

  @Patch(':commentId/moderation')
  @RequiresPermission('post.moderate')
  @ApiOperation({
    summary: 'Cho hiện lại hoặc gỡ hẳn một bình luận',
    description:
      '`VISIBLE` cho hiện lại, `REMOVED` gỡ hẳn. Số đếm bình luận và số trả lời đi theo trạng thái, nếu không con số nói dối. Bấm lại đúng quyết định cũ trả 400 thay vì ghi thêm một dòng audit nói rằng có gì đó vừa đổi. `reason` bắt buộc, ghi audit `MODERATE_COMMENT`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ModerateAdminCommentResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ValidationFailedException, ['reason không được để trống']],
    [ContentCommentNotFoundException],
  )
  public async moderateComment(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AdminCommentParamsDto,
    @Body() body: ModerateAdminCommentBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.moderateAdminCommentUseCase.handle({
          actorUserId: principal.userId,
          commentId: params.commentId,
          moderation: body.moderation,
        }),
      )
      .build();
  }
}
