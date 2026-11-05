import {
  ICreateCharityPostUseCase,
  IDeleteCharityPostUseCase,
  IGetCharityEventStepsUseCase,
  IGetCharityPostQuotaUseCase,
  IListCharityPostsUseCase,
  IRequestCharityPostUploadUseCase,
  IUpdateCharityEventStepUseCase,
} from '@/application/contracts/charity-project';
import {
  ICreateCommentUseCase,
  IListCommentsUseCase,
  IListContentReactionsUseCase,
  IRemoveContentReactionUseCase,
  IRequestCommentMediaUploadUseCase,
  ISetContentReactionUseCase,
} from '@/application/contracts/feed';
import {
  CharityCampaignNotFoundException,
  CharityEventStepNotFoundException,
  CharityPostForbiddenException,
  CharityPostMediaInvalidException,
  CharityPostNotFoundException,
  CharityPostQuotaExceededException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
  CharityProjectNotApprovedException,
  ContentBlockedTermsException,
  ContentCommentNotFoundException,
} from '@/domain/exceptions';
import { ContentSubjectTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
  Public,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
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
import { RequestCharityMediaUploadBodyDto } from '../../dto/charity-campaign/charity-campaign.dto';
import {
  CharityDeletedResponseDto,
  CharityEventStepBodyDto,
  CharityEventStepResponseDto,
  CharityEventStepsResponseDto,
  CharityPostCreateBodyDto,
  CharityPostQuotaResponseDto,
  CharityPostResponseDto,
  CharityPostUploadResponseDto,
  CharityPostsQueryDto,
  CharityPostsResponseDto,
  CharityProjectPostParamsDto,
  CharityProjectStepParamsDto,
} from '../../dto/charity-campaign/charity-event.dto';
import {
  CharityProjectIdOrSlugParamsDto,
  CharityProjectParamsDto,
} from '../../dto/charity-campaign/charity-project.dto';
import {
  CommentResponseDto,
  CreateCommentBodyDto,
  ListCommentsQueryDto,
  ListCommentsResponseDto,
  ListReactionsQueryDto,
  ListReactionsResponseDto,
  RequestCommentMediaUploadBodyDto,
  RequestCommentMediaUploadResponseDto,
  SetReactionBodyDto,
  SetReactionResponseDto,
} from '../../dto/feed';

const ok = <T>(body: T) => ResponseDto.create().succeed().attach(body).build();
const ProjectErrors = [
  CharityCampaignNotFoundException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
] as const;

/**
 * Dự án từ thiện 4 giai đoạn — đợt 3 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.5, §3.15;
 * API.md §18.3): timeline sự kiện trao, cộng tác viên sự kiện, bài ảnh/clip có quota. Realtime
 * ở namespace Socket.io `/charity`.
 */
@ApiTags('Dự án từ thiện 4 giai đoạn')
@Controller('charity-campaigns')
export class CharityEventController {
  public constructor(
    @Inject(IGetCharityEventStepsUseCase)
    private readonly stepsUseCase: IGetCharityEventStepsUseCase,
    @Inject(IUpdateCharityEventStepUseCase)
    private readonly updateStepUseCase: IUpdateCharityEventStepUseCase,
    @Inject(IGetCharityPostQuotaUseCase)
    private readonly quotaUseCase: IGetCharityPostQuotaUseCase,
    @Inject(IRequestCharityPostUploadUseCase)
    private readonly uploadUseCase: IRequestCharityPostUploadUseCase,
    @Inject(ICreateCharityPostUseCase)
    private readonly createPostUseCase: ICreateCharityPostUseCase,
    @Inject(IListCharityPostsUseCase)
    private readonly listPostsUseCase: IListCharityPostsUseCase,
    @Inject(IDeleteCharityPostUseCase)
    private readonly deletePostUseCase: IDeleteCharityPostUseCase,
    @Inject(ICreateCommentUseCase)
    private readonly createCommentUseCase: ICreateCommentUseCase,
    @Inject(IListCommentsUseCase)
    private readonly listCommentsUseCase: IListCommentsUseCase,
    @Inject(IRequestCommentMediaUploadUseCase)
    private readonly commentMediaUseCase: IRequestCommentMediaUploadUseCase,
    @Inject(ISetContentReactionUseCase)
    private readonly setReactionUseCase: ISetContentReactionUseCase,
    @Inject(IRemoveContentReactionUseCase)
    private readonly removeReactionUseCase: IRemoveContentReactionUseCase,
    @Inject(IListContentReactionsUseCase)
    private readonly listReactionsUseCase: IListContentReactionsUseCase,
  ) {}

  // ── Timeline ──────────────────────────────────────────────────────────

  @Get(':idOrSlug/event-steps')
  @Public()
  @ApiOperation({
    summary: 'Timeline sự kiện trao (SỐNG)',
    description:
      '10 bước: tập hợp → họp ngắn → di chuyển → nghỉ chân → đến nơi → làm việc với địa phương → gặp bên nhận → trao quà → tổng kết/cảm ơn → trở về. Không phải bản chụp: người xem theo dõi trực tiếp (thêm realtime `/charity`). Rỗng tới khi ban tổ chức mở timeline. Dự án đình chỉ → `404`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityEventStepsResponseDto) })
  @ApiErrorResponses(CharityCampaignNotFoundException)
  public async eventSteps(@Param() params: CharityProjectIdOrSlugParamsDto) {
    return ok({
      eventSteps: await this.stepsUseCase.handle({ idOrSlug: params.idOrSlug }),
    });
  }

  @Patch(':id/event-steps/:stepId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cập nhật một bước của timeline',
    description:
      'Người tạo, coordinator, Admin; dự án đã duyệt. Field bỏ trống giữ nguyên, `null` xoá. Chuyển `DONE` mà không gửi `actualAt` thì lấy giờ hiện tại. Phát tín hiệu realtime `TIMELINE`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityEventStepResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharityProjectNotApprovedException,
    CharityEventStepNotFoundException,
  )
  public async updateEventStep(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectStepParamsDto,
    @Body() body: CharityEventStepBodyDto,
  ) {
    return ok({
      eventStep: await this.updateStepUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        stepId: params.stepId,
        patch: body.step,
      }),
    });
  }

  // ── Bài ảnh/clip ──────────────────────────────────────────────────────

  @Get(':id/posts/quota')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Quyền đăng và quota ảnh/clip hôm nay của tôi',
    description:
      'Quota theo NGƯỜI + DỰ ÁN + ngày giờ Việt Nam (mặc định 5 clip + 5 ảnh, Admin chỉnh `charity.post_daily_video_quota` / `charity.post_daily_image_quota`). Mỗi lượt ký đường tải tính một suất.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityPostQuotaResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async quota(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
  ) {
    return ok({
      quota: await this.quotaUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
      }),
    });
  }

  @Post(':id/posts/media/upload')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Ký đường tải ảnh/clip cho bài',
    description:
      'Kiểm quyền đăng rồi quota TRƯỚC khi ký. PUT tệp lên `uploadUrl`, rồi gửi `key` trong `post.mediaKeys`. Giới hạn dung lượng/định dạng như ảnh hồ sơ dự án.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(CharityPostUploadResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityPostForbiddenException,
    CharityPostQuotaExceededException,
  )
  public async upload(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: RequestCharityMediaUploadBodyDto,
  ) {
    return ok(
      await this.uploadUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        contentType: body.upload.contentType,
        contentLength: body.upload.contentLength,
      }),
    );
  }

  @Post(':id/posts')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đăng bài ảnh/clip vào dự án',
    description:
      'Ban tổ chức/coordinator: mọi giai đoạn sau duyệt. Người dùng: chỉ khi được cấp cộng tác viên sự kiện và dự án đang ở Sự kiện trao. Cần nội dung hoặc ít nhất một tệp; mỗi `key` chỉ dùng một lần. Phát tín hiệu realtime `POSTS`.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CharityPostResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityPostForbiddenException,
    CharityPostMediaInvalidException,
  )
  public async createPost(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityPostCreateBodyDto,
  ) {
    return ok({
      post: await this.createPostUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        body: body.post.body ?? null,
        mediaKeys: body.post.mediaKeys ?? [],
      }),
    });
  }

  @Get(':idOrSlug/posts')
  @Public()
  @ApiOperation({
    summary: 'Bài ảnh/clip của dự án',
    description:
      'Mới nhất trước, phân trang `before` = `nextBefore`. Bài đã gỡ hoặc bị Admin ẩn không hiện.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityPostsResponseDto) })
  @ApiErrorResponses(CharityCampaignNotFoundException)
  public async posts(
    @Param() params: CharityProjectIdOrSlugParamsDto,
    @Query() query: CharityPostsQueryDto,
  ) {
    return ok(
      await this.listPostsUseCase.handle({
        idOrSlug: params.idOrSlug,
        beforePostId: query.before ?? null,
        limit: query.limit ?? 20,
      }),
    );
  }

  @Delete(':id/posts/:postId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gỡ bài',
    description:
      'Tác giả gỡ bài của mình; ban tổ chức, coordinator, Admin gỡ mọi bài.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityDeletedResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityPostNotFoundException,
    CharityProjectForbiddenException,
  )
  public async deletePost(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectPostParamsDto,
  ) {
    return ok(
      await this.deletePostUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        postId: params.postId,
      }),
    );
  }

  // ── Thích, bình luận từng bài ─────────────────────────────────────────

  @Put(':id/posts/:postId/reactions/me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Bày tỏ cảm xúc với một bài',
    description: 'Hệ cảm xúc chung (`REACT_CONTENT`). Bài gỡ/ẩn → `404`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(SetReactionResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityPostNotFoundException)
  public async setPostReaction(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectPostParamsDto,
    @Body() body: SetReactionBodyDto,
  ) {
    return ok(
      await this.setReactionUseCase.handle({
        userId: principal.userId,
        subjectType: ContentSubjectTypes.CHARITY_CAMPAIGN_POST,
        subjectId: params.postId,
        kind: body.reaction.kind,
      }),
    );
  }

  @Delete(':id/posts/:postId/reactions/me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Gỡ cảm xúc của mình khỏi một bài' })
  @ApiOkResponse({ type: ResponseDto.forApi(SetReactionResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async removePostReaction(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectPostParamsDto,
  ) {
    return ok(
      await this.removeReactionUseCase.handle({
        userId: principal.userId,
        subjectType: ContentSubjectTypes.CHARITY_CAMPAIGN_POST,
        subjectId: params.postId,
      }),
    );
  }

  @Get(':id/posts/:postId/reactions')
  @Public()
  @ApiOperation({ summary: 'Ai đã bày tỏ cảm xúc với một bài' })
  @ApiOkResponse({ type: ResponseDto.forApi(ListReactionsResponseDto) })
  @ApiErrorResponses(CharityPostNotFoundException)
  public async listPostReactions(
    @Param() params: CharityProjectPostParamsDto,
    @Query() query: ListReactionsQueryDto,
    @CurrentUser() principal?: IAuthPrincipal,
  ) {
    return ok(
      await this.listReactionsUseCase.handle({
        viewerId: principal?.userId ?? null,
        subjectType: ContentSubjectTypes.CHARITY_CAMPAIGN_POST,
        subjectId: params.postId,
        kind: query.kind,
        page: query.page,
        pageSize: query.pageSize,
      }),
    );
  }

  @Post(':id/posts/:postId/comment-media/upload-url')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đường tải ảnh cho bình luận trong một bài' })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(RequestCommentMediaUploadResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors)
  public async postCommentMedia(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectPostParamsDto,
    @Body() body: RequestCommentMediaUploadBodyDto,
  ) {
    return ok(
      await this.commentMediaUseCase.handle({
        userId: principal.userId,
        subjectType: ContentSubjectTypes.CHARITY_CAMPAIGN_POST,
        subjectId: params.postId,
        contentType: body.upload.contentType,
        contentLength: body.upload.contentLength,
      }),
    );
  }

  @Post(':id/posts/:postId/comments')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Bình luận vào một bài',
    description:
      'Như bình luận bài đăng; trả lời, sửa, gỡ đi `/comments/:commentId/...` chung. Bài gỡ/ẩn → `404`.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CommentResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityPostNotFoundException,
    ContentCommentNotFoundException,
    ContentBlockedTermsException,
  )
  public async createPostComment(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectPostParamsDto,
    @Body() body: CreateCommentBodyDto,
  ) {
    return ok(
      await this.createCommentUseCase.handle({
        userId: principal.userId,
        subjectType: ContentSubjectTypes.CHARITY_CAMPAIGN_POST,
        subjectId: params.postId,
        body: body.comment.body,
        parentId: body.comment.parentId,
        mediaKeys: body.comment.mediaKeys,
      }),
    );
  }

  @Get(':id/posts/:postId/comments')
  @Public()
  @ApiOperation({ summary: 'Bình luận gốc của một bài' })
  @ApiOkResponse({ type: ResponseDto.forApi(ListCommentsResponseDto) })
  @ApiErrorResponses(CharityPostNotFoundException)
  public async listPostComments(
    @Param() params: CharityProjectPostParamsDto,
    @Query() query: ListCommentsQueryDto,
    @CurrentUser() principal?: IAuthPrincipal,
  ) {
    return ok(
      await this.listCommentsUseCase.handle({
        viewerId: principal?.userId ?? null,
        subjectType: ContentSubjectTypes.CHARITY_CAMPAIGN_POST,
        subjectId: params.postId,
        limit: query.limit,
        before: query.before,
      }),
    );
  }
}
