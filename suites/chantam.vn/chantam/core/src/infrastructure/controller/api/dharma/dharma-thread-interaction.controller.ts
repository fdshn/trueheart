import {
  ICreateCommentUseCase,
  IListCommentsUseCase,
  IListContentReactionsUseCase,
  IRemoveContentReactionUseCase,
  IRequestCommentMediaUploadUseCase,
  ISetContentReactionUseCase,
} from '@/application/contracts/feed';
import {
  ContentBlockedTermsException,
  ContentCommentNotFoundException,
  DharmaThreadLockedException,
  DharmaThreadNotFoundException,
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
  CommentResponseDto,
  CommentSubjectParamsDto,
  CreateCommentBodyDto,
  ListCommentsQueryDto,
  ListCommentsResponseDto,
  ListReactionsQueryDto,
  ListReactionsResponseDto,
  ReactionSubjectParamsDto,
  RequestCommentMediaUploadBodyDto,
  RequestCommentMediaUploadResponseDto,
  SetReactionBodyDto,
  SetReactionResponseDto,
} from '../../dto/feed';

/**
 * Bình luận và cảm xúc cho chủ đề Diễn đàn Phật Pháp (F73, UC-DHARMA-03).
 *
 * KHÔNG có use case riêng: UC-DHARMA-03 nói tái sử dụng cơ chế của bảng tin, và các use
 * case đó đã nhận `DHARMA_THREAD` từ 04/10 (chủ đề phải có thật, đang hiện, chưa khoá). Cái
 * thiếu là đường HTTP — trước 22/10 mọi route bình luận/cảm xúc ghi cứng `subjectType=POST`,
 * nên mobile không có cách nào bình luận vào một chủ đề.
 *
 * Trả lời, sửa, gỡ bình luận và cảm xúc cho bình luận KHÔNG lặp lại ở đây: các route
 * `/comments/:commentId/...` không mang chủ thể, nên phục vụ bình luận của chủ đề y như
 * bình luận của bài.
 */
@ApiTags('Phật Pháp - Diễn đàn')
@Controller('dharma/threads')
export class DharmaThreadInteractionController {
  public constructor(
    @Inject(ICreateCommentUseCase)
    private readonly createCommentUseCase: ICreateCommentUseCase,
    @Inject(IListCommentsUseCase)
    private readonly listCommentsUseCase: IListCommentsUseCase,
    @Inject(IRequestCommentMediaUploadUseCase)
    private readonly requestMediaUploadUseCase: IRequestCommentMediaUploadUseCase,
    @Inject(ISetContentReactionUseCase)
    private readonly setReactionUseCase: ISetContentReactionUseCase,
    @Inject(IRemoveContentReactionUseCase)
    private readonly removeReactionUseCase: IRemoveContentReactionUseCase,
    @Inject(IListContentReactionsUseCase)
    private readonly listReactionsUseCase: IListContentReactionsUseCase,
  ) {}

  @Post(':subjectId/comment-media/upload-url')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đường tải ảnh cho bình luận trong chủ đề',
    description:
      'Như `POST /posts/:subjectId/comment-media/upload-url`, khoá theo chủ đề. ' +
      'PUT xong thì gửi `key` trong `comment.mediaKeys` lúc tạo bình luận. Tối đa 3 ảnh.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(RequestCommentMediaUploadResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors)
  public async requestCommentMediaUpload(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CommentSubjectParamsDto,
    @Body() body: RequestCommentMediaUploadBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.requestMediaUploadUseCase.handle({
          userId: principal.userId,
          subjectType: ContentSubjectTypes.DHARMA_THREAD,
          subjectId: params.subjectId,
          contentType: body.upload.contentType,
          contentLength: body.upload.contentLength,
        }),
      )
      .build();
  }

  @Post(':subjectId/comments')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Bình luận vào một chủ đề',
    description:
      'Có `parentId` thì đây là TRẢ LỜI — chỉ trả lời được bình luận gốc của CHÍNH chủ đề này. ' +
      'Chủ đề chờ duyệt, đã ẩn hoặc không có trả `404`; chủ đề Admin đã khoá bình luận trả ' +
      '`DHARMA_THREAD_LOCKED`. Bộ lọc từ ngữ và quyền `COMMENT_CONTENT` như bình luận bài đăng. ' +
      'Tác giả chủ đề nhận thông báo `CONTENT_COMMENT_CREATED` với `targetType=DHARMA_THREAD`.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CommentResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    DharmaThreadNotFoundException,
    DharmaThreadLockedException,
    ContentCommentNotFoundException,
    ContentBlockedTermsException,
  )
  public async createThreadComment(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CommentSubjectParamsDto,
    @Body() body: CreateCommentBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.createCommentUseCase.handle({
          userId: principal.userId,
          subjectType: ContentSubjectTypes.DHARMA_THREAD,
          subjectId: params.subjectId,
          body: body.comment.body,
          parentId: body.comment.parentId,
          mediaKeys: body.comment.mediaKeys,
        }),
      )
      .build();
  }

  @Public()
  @Get(':subjectId/comments')
  @ApiOperation({
    summary: 'Bình luận gốc của một chủ đề',
    description:
      'Mới nhất trước, phân trang bằng con trỏ như bình luận bài đăng. Trả lời lấy qua ' +
      '`GET /comments/:commentId/replies`. Chủ đề chờ duyệt hoặc đã ẩn trả `404` — ẩn chủ đề ' +
      'là ẩn luôn cuộc trò chuyện bên dưới.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListCommentsResponseDto) })
  @ApiErrorResponses(DharmaThreadNotFoundException)
  public async listThreadComments(
    @CurrentUser() principal: IAuthPrincipal | null,
    @Param() params: CommentSubjectParamsDto,
    @Query() query: ListCommentsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listCommentsUseCase.handle({
          viewerId: principal?.userId ?? null,
          subjectType: ContentSubjectTypes.DHARMA_THREAD,
          subjectId: params.subjectId,
          limit: query.limit,
          before: query.before,
        }),
      )
      .build();
  }

  @Put(':subjectId/reactions/me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đặt hoặc đổi cảm xúc cho một chủ đề',
    description:
      '`PUT` bình thái như cảm xúc bài đăng. Chủ đề đã KHOÁ bình luận vẫn nhận cảm xúc — khoá ' +
      'là khoá bình luận. Cần quyền `REACT_CONTENT`. Không cộng điểm: luật điểm cảm xúc là ' +
      'luật của bài đăng.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(SetReactionResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, DharmaThreadNotFoundException)
  public async setThreadReaction(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ReactionSubjectParamsDto,
    @Body() body: SetReactionBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.setReactionUseCase.handle({
          userId: principal.userId,
          subjectType: ContentSubjectTypes.DHARMA_THREAD,
          subjectId: params.subjectId,
          kind: body.reaction.kind,
        }),
      )
      .build();
  }

  @Delete(':subjectId/reactions/me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gỡ cảm xúc của mình khỏi một chủ đề',
    description:
      'Không kiểm quyền và không kiểm chủ đề: người đã bày tỏ thì luôn rút lại được, kể cả ' +
      'khi chủ đề vừa bị ẩn.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(SetReactionResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async removeThreadReaction(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ReactionSubjectParamsDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.removeReactionUseCase.handle({
          userId: principal.userId,
          subjectType: ContentSubjectTypes.DHARMA_THREAD,
          subjectId: params.subjectId,
        }),
      )
      .build();
  }

  @Public()
  @Get(':subjectId/reactions')
  @ApiOperation({
    summary: 'Ai đã bày tỏ cảm xúc với chủ đề',
    description:
      'Công khai. `summary.myReaction` chỉ khác `null` khi gọi kèm token. Chủ đề chờ duyệt ' +
      'hoặc đã ẩn trả `404`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListReactionsResponseDto) })
  @ApiErrorResponses(DharmaThreadNotFoundException)
  public async listThreadReactions(
    @CurrentUser() principal: IAuthPrincipal | null,
    @Param() params: ReactionSubjectParamsDto,
    @Query() query: ListReactionsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listReactionsUseCase.handle({
          viewerId: principal?.userId ?? null,
          subjectType: ContentSubjectTypes.DHARMA_THREAD,
          subjectId: params.subjectId,
          kind: query.kind,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }
}
