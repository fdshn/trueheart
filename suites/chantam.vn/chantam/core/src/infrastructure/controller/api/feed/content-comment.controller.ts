import {
  ICreateCommentUseCase,
  IEditCommentUseCase,
  IListCommentRepliesUseCase,
  IListCommentsUseCase,
  IRemoveCommentUseCase,
} from '@/application/contracts/feed';
import {
  ContentBlockedTermsException,
  ContentCommentNotFoundException,
  ContentEditWindowClosedException,
  PostNotFoundException,
} from '@/domain/exceptions';
import {
  CommentEditWindowMinutes,
  ContentSubjectTypes,
} from '@chantam.vn/chantam.core-lib/consts';
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
  CommentIdParamsDto,
  CommentResponseDto,
  CommentSubjectParamsDto,
  CreateCommentBodyDto,
  EditCommentBodyDto,
  ListCommentsQueryDto,
  ListCommentsResponseDto,
  ListRepliesQueryDto,
} from '../../dto/feed';

@ApiTags('Tương tác bảng tin')
@Controller()
export class ContentCommentController {
  public constructor(
    @Inject(ICreateCommentUseCase)
    private readonly createCommentUseCase: ICreateCommentUseCase,
    @Inject(IEditCommentUseCase)
    private readonly editCommentUseCase: IEditCommentUseCase,
    @Inject(IRemoveCommentUseCase)
    private readonly removeCommentUseCase: IRemoveCommentUseCase,
    @Inject(IListCommentsUseCase)
    private readonly listCommentsUseCase: IListCommentsUseCase,
    @Inject(IListCommentRepliesUseCase)
    private readonly listRepliesUseCase: IListCommentRepliesUseCase,
  ) {}

  @Post('posts/:subjectId/comments')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Bình luận vào một bài đăng',
    description:
      'Có `parentId` thì đây là TRẢ LỜI. Chỉ trả lời được bình luận gốc — không có cấp ba, và ràng buộc đó do khoá ngoại ghép ở database giữ chứ không phải tầng ứng dụng. ' +
      'Nội dung đi qua bộ lọc từ ngữ Admin cấu hình: mức `BLOCK` trả `422 CONTENT_BLOCKED_TERMS` và KHÔNG tạo gì; mức `REVIEW` vẫn tạo nhưng ẩn khỏi công khai và vào hàng đợi Admin — tác giả vẫn thấy bình luận của mình. ' +
      'Cần quyền `COMMENT_CONTENT`; mặc định VIEWER chỉ đọc.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(CommentResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    PostNotFoundException,
    ContentCommentNotFoundException,
    ContentBlockedTermsException,
  )
  public async createPostComment(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CommentSubjectParamsDto,
    @Body() body: CreateCommentBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.createCommentUseCase.handle({
          userId: principal.userId,
          subjectType: ContentSubjectTypes.POST,
          subjectId: params.subjectId,
          body: body.comment.body,
          parentId: body.comment.parentId,
        }),
      )
      .build();
  }

  @Public()
  @Get('posts/:subjectId/comments')
  @ApiOperation({
    summary: 'Bình luận gốc của một bài đăng',
    description:
      'Mới nhất trước, phân trang bằng CON TRỎ chứ không `page`: bình luận được thêm vào ĐẦU, nên OFFSET trôi theo mỗi bình luận mới và cửa sổ sau sẽ lặp lại thứ người dùng vừa đọc. ' +
      'Gọi kèm token thì tác giả thấy thêm bình luận đang chờ duyệt CỦA CHÍNH MÌNH — im lặng nuốt bài của họ thì họ sẽ gửi lại.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListCommentsResponseDto) })
  public async listPostComments(
    @CurrentUser() principal: IAuthPrincipal | null,
    @Param() params: CommentSubjectParamsDto,
    @Query() query: ListCommentsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listCommentsUseCase.handle({
          viewerId: principal?.userId ?? null,
          subjectType: ContentSubjectTypes.POST,
          subjectId: params.subjectId,
          limit: query.limit,
          before: query.before,
        }),
      )
      .build();
  }

  @Public()
  @Get('comments/:commentId/replies')
  @ApiOperation({
    summary: 'Trả lời của một bình luận',
    description:
      'CŨ nhất trước — ngược chiều với danh sách gốc, và cố ý: một cuộc trao đổi đọc từ trên xuống mới hiểu được.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListCommentsResponseDto) })
  public async listReplies(
    @CurrentUser() principal: IAuthPrincipal | null,
    @Param() params: CommentIdParamsDto,
    @Query() query: ListRepliesQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listRepliesUseCase.handle({
          viewerId: principal?.userId ?? null,
          commentId: params.commentId,
          limit: query.limit,
          after: query.after,
        }),
      )
      .build();
  }

  @Patch('comments/:commentId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sửa bình luận của chính mình',
    description:
      `Chỉ trong ${CommentEditWindowMinutes} phút đầu. Sửa được mãi thì một bình luận hiền lành đã có 20 lượt đồng tình có thể bị đổi thành thứ khác hẳn, và người đã bày tỏ cảm xúc không rút lại được. ` +
      'Nội dung mới đi qua bộ lọc từ ngữ lần nữa.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CommentResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ContentCommentNotFoundException,
    [ContentEditWindowClosedException, [CommentEditWindowMinutes]],
    ContentBlockedTermsException,
  )
  public async editComment(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CommentIdParamsDto,
    @Body() body: EditCommentBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.editCommentUseCase.handle({
          userId: principal.userId,
          commentId: params.commentId,
          body: body.comment.body,
        }),
      )
      .build();
  }

  @Delete('comments/:commentId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gỡ bình luận',
    description:
      'Tác giả bình luận **hoặc chủ bài** gỡ được — bài đăng là không gian của chủ bài, và bắt họ đợi Admin để xoá một câu xúc phạm là bỏ mặc họ. ' +
      'Gỡ là đổi trạng thái, KHÔNG xoá dòng: chuỗi trả lời bên dưới cần giữ ngữ cảnh, và còn thứ để đối chiếu khi có khiếu nại.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(CommentResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ContentCommentNotFoundException)
  public async removeComment(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CommentIdParamsDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.removeCommentUseCase.handle({
          userId: principal.userId,
          commentId: params.commentId,
        }),
      )
      .build();
  }
}
