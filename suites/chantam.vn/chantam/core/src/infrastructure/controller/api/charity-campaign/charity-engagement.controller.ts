import {
  ICreateCharityExportUseCase,
  ICreateCharityShareLinkUseCase,
  IFollowCharityProjectUseCase,
  IGetCharityExportPdfUseCase,
  IGetCharityInternalStatsUseCase,
  IGetCharityPublicStatsUseCase,
  IListCharityExportsUseCase,
  IListCharityRevisionsUseCase,
  IListCharityTasksUseCase,
  IUpdateCharityTaskUseCase,
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
  CharityExportNotFoundException,
  CharityProjectForbiddenException,
  CharityProjectInactiveException,
  CharityProjectNotApprovedException,
  CharitySectionNotPublishedException,
  CharityTaskNotFoundException,
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
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import {
  CharityExportCreateBodyDto,
  CharityExportResponseDto,
  CharityExportsResponseDto,
  CharityFollowResponseDto,
  CharityInternalStatsResponseDto,
  CharityProjectExportParamsDto,
  CharityProjectTaskParamsDto,
  CharityPublicStatsResponseDto,
  CharityRevisionsQueryDto,
  CharityRevisionsResponseDto,
  CharityShareCreateBodyDto,
  CharityShareLinkResponseDto,
  CharityTaskBodyDto,
  CharityTaskResponseDto,
  CharityTasksResponseDto,
} from '../../dto/charity-campaign/charity-engagement.dto';
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
 * Dự án từ thiện 4 giai đoạn — đợt 2 (docs/plan/CHARITY-PROJECT-LIFECYCLE.md §3.3, §3.4, §3.7,
 * §3.8, §3.13; API.md §18): checklist tab B, lịch sử sửa, quan tâm, thích/bình luận, thống kê,
 * bản in PDF, link chia sẻ. Báo cáo vi phạm đi `POST /reports` với `targetType=CHARITY_CAMPAIGN`.
 */
@ApiTags('Dự án từ thiện 4 giai đoạn')
@Controller('charity-campaigns')
export class CharityEngagementController {
  public constructor(
    @Inject(IListCharityTasksUseCase)
    private readonly listTasksUseCase: IListCharityTasksUseCase,
    @Inject(IUpdateCharityTaskUseCase)
    private readonly updateTaskUseCase: IUpdateCharityTaskUseCase,
    @Inject(IListCharityRevisionsUseCase)
    private readonly revisionsUseCase: IListCharityRevisionsUseCase,
    @Inject(IFollowCharityProjectUseCase)
    private readonly followUseCase: IFollowCharityProjectUseCase,
    @Inject(IGetCharityPublicStatsUseCase)
    private readonly publicStatsUseCase: IGetCharityPublicStatsUseCase,
    @Inject(IGetCharityInternalStatsUseCase)
    private readonly internalStatsUseCase: IGetCharityInternalStatsUseCase,
    @Inject(ICreateCharityExportUseCase)
    private readonly createExportUseCase: ICreateCharityExportUseCase,
    @Inject(IListCharityExportsUseCase)
    private readonly listExportsUseCase: IListCharityExportsUseCase,
    @Inject(IGetCharityExportPdfUseCase)
    private readonly pdfUseCase: IGetCharityExportPdfUseCase,
    @Inject(ICreateCharityShareLinkUseCase)
    private readonly shareUseCase: ICreateCharityShareLinkUseCase,
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

  // ── Checklist tab B ───────────────────────────────────────────────────

  @Get(':id/tasks')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Checklist triển khai (tab B)',
    description:
      '7 việc mẫu: cấp phép, truyền thông, tiếp nhận, theo dõi, kết thúc tiếp nhận, đóng gói, tiền trạm. Có từ khi dự án được duyệt (trước đó trả mảng rỗng); mốc gợi ý: kết thúc tiếp nhận = hạn nhận hiện vật sớm nhất, tiền trạm = 48 giờ trước bước trao. Người tạo, coordinator, Admin.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityTasksResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async tasks(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
  ) {
    return ok({
      tasks: await this.listTasksUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
      }),
    });
  }

  @Patch(':id/tasks/:taskId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cập nhật một việc trong checklist',
    description:
      'Người tạo, coordinator, Admin. Field bỏ trống giữ nguyên, `null` là xoá. Đổi `status`/`scheduledAt` ghi lịch sử sửa. `remark` là ghi chú nội bộ — không lên bản công khai; công khai mục Triển khai mới chụp checklist ra ngoài.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityTaskResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ...ProjectErrors,
    CharityProjectNotApprovedException,
    CharityTaskNotFoundException,
  )
  public async updateTask(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectTaskParamsDto,
    @Body() body: CharityTaskBodyDto,
  ) {
    return ok({
      task: await this.updateTaskUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        taskId: params.taskId,
        patch: body.task,
      }),
    });
  }

  // ── Lịch sử sửa ───────────────────────────────────────────────────────

  @Get(':idOrSlug/revisions')
  @Public()
  @ApiOperation({
    summary: 'Changelog công khai',
    description:
      'Những gì ban tổ chức đã sửa sau khi dự án được duyệt — mới nhất trước, chỉ field công khai, không lộ người sửa. Dự án đã đóng vẫn xem được. Phân trang bằng `before` = `nextBefore` của trang trước.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityRevisionsResponseDto) })
  @ApiErrorResponses(CharityCampaignNotFoundException)
  public async publicRevisions(
    @Param() params: CharityProjectIdOrSlugParamsDto,
    @Query() query: CharityRevisionsQueryDto,
  ) {
    return ok(
      await this.revisionsUseCase.handle({
        idOrSlug: params.idOrSlug,
        userId: null,
        scope: 'PUBLIC',
        beforeRevisionId: query.before ?? null,
        limit: query.limit ?? 30,
      }),
    );
  }

  @Get(':id/workspace/revisions')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lịch sử sửa đầy đủ (workspace)',
    description:
      'Như changelog công khai nhưng đủ mọi field (kể cả riêng tư), có người sửa, gồm cả checklist. Người tạo, coordinator, Admin `campaign.read`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityRevisionsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async workspaceRevisions(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Query() query: CharityRevisionsQueryDto,
  ) {
    return ok(
      await this.revisionsUseCase.handle({
        idOrSlug: params.id,
        userId: principal.userId,
        scope: 'WORKSPACE',
        beforeRevisionId: query.before ?? null,
        limit: query.limit ?? 30,
      }),
    );
  }

  // ── Quan tâm ──────────────────────────────────────────────────────────

  @Post(':idOrSlug/follow')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Quan tâm dự án',
    description:
      'Khác thích: người quan tâm nhận thông báo khi dự án chuyển giai đoạn, kế hoạch đổi điều quan trọng, sắp tới lúc trao, công khai tổng kết. Gọi lại khi đã quan tâm vẫn `200`. Chỉ dự án còn chạy.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityFollowResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async follow(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectIdOrSlugParamsDto,
  ) {
    return ok({
      follow: await this.followUseCase.handle({
        idOrSlug: params.idOrSlug,
        userId: principal.userId,
        follow: true,
      }),
    });
  }

  @Delete(':idOrSlug/follow')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bỏ quan tâm dự án' })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityFollowResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async unfollow(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectIdOrSlugParamsDto,
  ) {
    return ok({
      follow: await this.followUseCase.handle({
        idOrSlug: params.idOrSlug,
        userId: principal.userId,
        follow: false,
      }),
    });
  }

  // ── Thích, bình luận ──────────────────────────────────────────────────

  @Put(':id/reactions/me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thích / bày tỏ cảm xúc với dự án',
    description:
      'Dùng chung hệ cảm xúc của bảng tin (`REACT_CONTENT`). Dự án chưa duyệt hoặc bị đình chỉ trả `404`. Người tạo dự án nhận `CONTENT_REACTION_FIRST_OF_DAY` với `targetType=CHARITY_CAMPAIGN`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(SetReactionResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async setReaction(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: SetReactionBodyDto,
  ) {
    return ok(
      await this.setReactionUseCase.handle({
        userId: principal.userId,
        subjectType: ContentSubjectTypes.CHARITY_CAMPAIGN,
        subjectId: params.id,
        kind: body.reaction.kind,
      }),
    );
  }

  @Delete(':id/reactions/me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gỡ cảm xúc của mình khỏi dự án',
    description: 'Luôn rút lại được, kể cả khi dự án vừa bị đình chỉ.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(SetReactionResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async removeReaction(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
  ) {
    return ok(
      await this.removeReactionUseCase.handle({
        userId: principal.userId,
        subjectType: ContentSubjectTypes.CHARITY_CAMPAIGN,
        subjectId: params.id,
      }),
    );
  }

  @Get(':id/reactions')
  @Public()
  @ApiOperation({
    summary: 'Ai đã bày tỏ cảm xúc với dự án',
    description: '`summary.myReaction` chỉ khác `null` khi gọi kèm token.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListReactionsResponseDto) })
  @ApiErrorResponses(CharityCampaignNotFoundException)
  public async listReactions(
    @Param() params: CharityProjectParamsDto,
    @Query() query: ListReactionsQueryDto,
    @CurrentUser() principal?: IAuthPrincipal,
  ) {
    return ok(
      await this.listReactionsUseCase.handle({
        viewerId: principal?.userId ?? null,
        subjectType: ContentSubjectTypes.CHARITY_CAMPAIGN,
        subjectId: params.id,
        kind: query.kind,
        page: query.page,
        pageSize: query.pageSize,
      }),
    );
  }

  @Post(':id/comment-media/upload-url')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đường tải ảnh cho bình luận trong dự án',
    description:
      'Như `POST /posts/:subjectId/comment-media/upload-url`. PUT xong thì gửi `key` trong `comment.mediaKeys`. Tối đa 3 ảnh.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(RequestCommentMediaUploadResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors)
  public async commentMediaUpload(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: RequestCommentMediaUploadBodyDto,
  ) {
    return ok(
      await this.commentMediaUseCase.handle({
        userId: principal.userId,
        subjectType: ContentSubjectTypes.CHARITY_CAMPAIGN,
        subjectId: params.id,
        contentType: body.upload.contentType,
        contentLength: body.upload.contentLength,
      }),
    );
  }

  @Post(':id/comments')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Bình luận vào dự án',
    description:
      'Có `parentId` thì là trả lời một bình luận gốc của CHÍNH dự án này. Bộ lọc từ ngữ và quyền `COMMENT_CONTENT` như bình luận bài đăng. Dự án chưa duyệt hoặc bị đình chỉ trả `404`; dự án đã đóng vẫn nhận lời cảm ơn. Người tạo dự án nhận `CONTENT_COMMENT_CREATED` với `targetType=CHARITY_CAMPAIGN`.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CommentResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    ContentCommentNotFoundException,
    ContentBlockedTermsException,
  )
  public async createComment(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CreateCommentBodyDto,
  ) {
    return ok(
      await this.createCommentUseCase.handle({
        userId: principal.userId,
        subjectType: ContentSubjectTypes.CHARITY_CAMPAIGN,
        subjectId: params.id,
        body: body.comment.body,
        parentId: body.comment.parentId,
        mediaKeys: body.comment.mediaKeys,
      }),
    );
  }

  @Get(':id/comments')
  @Public()
  @ApiOperation({
    summary: 'Bình luận gốc của dự án',
    description:
      'Mới nhất trước, phân trang bằng con trỏ. Trả lời lấy qua `GET /comments/:commentId/replies`; sửa/gỡ/thả cảm xúc bình luận dùng các route `/comments/:commentId/...` chung.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListCommentsResponseDto) })
  @ApiErrorResponses(CharityCampaignNotFoundException)
  public async listComments(
    @Param() params: CharityProjectParamsDto,
    @Query() query: ListCommentsQueryDto,
    @CurrentUser() principal?: IAuthPrincipal,
  ) {
    return ok(
      await this.listCommentsUseCase.handle({
        viewerId: principal?.userId ?? null,
        subjectType: ContentSubjectTypes.CHARITY_CAMPAIGN,
        subjectId: params.id,
        limit: query.limit,
        before: query.before,
      }),
    );
  }

  // ── Thống kê ──────────────────────────────────────────────────────────

  @Get(':idOrSlug/public-stats')
  @Public()
  @ApiOperation({
    summary: 'Thống kê công khai',
    description:
      'Số tổng hợp: thích, bình luận, quan tâm, người ủng hộ, người tham gia, tổng nhu cầu hiện vật/tiền/người. Không có số báo cáo vi phạm hay đề nghị bị từ chối.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityPublicStatsResponseDto) })
  @ApiErrorResponses(CharityCampaignNotFoundException)
  public async publicStats(@Param() params: CharityProjectIdOrSlugParamsDto) {
    return ok({
      stats: await this.publicStatsUseCase.handle({
        idOrSlug: params.idOrSlug,
        userId: null,
      }),
    });
  }

  @Get(':id/internal-stats')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Thống kê nội bộ',
    description:
      'Đề nghị đóng góp theo trạng thái, người tham gia (đăng ký/huỷ), tuyển người (đăng ký/xác nhận/huỷ), báo cáo vi phạm (đang mở/tổng), lượt chia sẻ, và nhu cầu tách đăng ký / đã duyệt / nhận trong app / nhận ngoài app / còn thiếu. Người tạo, coordinator, Admin `campaign.read`.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(CharityInternalStatsResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async internalStats(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
  ) {
    return ok({
      stats: await this.internalStatsUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
      }),
    });
  }

  // ── Bản in, chia sẻ ───────────────────────────────────────────────────

  @Post(':id/exports')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Tạo bản in PDF',
    description:
      'Chụp nội dung CÔNG KHAI của dự án lúc này (hoặc một mục, gửi `export.sectionKey`) kèm mã revision cuối và người tạo. Tải bao nhiêu lần cũng đúng nội dung lúc tạo. Body có thể bỏ trống. Người tạo, coordinator, Admin `campaign.read`.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CharityExportResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async createExport(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
    @Body() body: CharityExportCreateBodyDto,
  ) {
    return ok({
      export: await this.createExportUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
        sectionKey: body?.export?.sectionKey ?? null,
      }),
    });
  }

  @Get(':id/exports')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Các bản in đã tạo (50 bản mới nhất)' })
  @ApiOkResponse({ type: ResponseDto.forApi(CharityExportsResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, CharityCampaignNotFoundException)
  public async listExports(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectParamsDto,
  ) {
    return ok({
      exports: await this.listExportsUseCase.handle({
        userId: principal.userId,
        campaignId: params.id,
      }),
    });
  }

  @Get(':id/exports/:exportId/pdf')
  @ApiBearerAuth()
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Tải bản in PDF',
    description:
      'Trả thẳng tệp `application/pdf` (không bọc JSON). Font DejaVu Sans, đủ dấu tiếng Việt.',
  })
  @ApiOkResponse({
    description: 'Tệp PDF',
    content: {
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharityExportNotFoundException,
  )
  public async downloadExport(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectExportParamsDto,
  ): Promise<StreamableFile> {
    const { fileName, pdf } = await this.pdfUseCase.handle({
      userId: principal.userId,
      campaignId: params.id,
      exportId: params.exportId,
    });
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
      length: pdf.length,
    });
  }

  @Post(':idOrSlug/share-links')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Tạo link chia sẻ công khai',
    description:
      'Cả dự án, hoặc một mục ĐÃ công khai (`share.sectionKey`). Link `/c/{slug}` mở web landing / app và chỉ tới bản công khai. Mỗi lượt được đếm vào thống kê chia sẻ. Body có thể bỏ trống.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(CharityShareLinkResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    CharityCampaignNotFoundException,
    CharitySectionNotPublishedException,
  )
  public async share(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CharityProjectIdOrSlugParamsDto,
    @Body() body: CharityShareCreateBodyDto,
  ) {
    return ok({
      share: await this.shareUseCase.handle({
        idOrSlug: params.idOrSlug,
        userId: principal.userId,
        sectionKey: body?.share?.sectionKey ?? null,
        channel: body?.share?.channel ?? null,
      }),
    });
  }
}
