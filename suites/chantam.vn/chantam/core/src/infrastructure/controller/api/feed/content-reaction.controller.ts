import {
  IListContentReactionsUseCase,
  IRemoveContentReactionUseCase,
  ISetContentReactionUseCase,
} from '@/application/contracts/feed';
import { PostNotFoundException } from '@/domain/exceptions';
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
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ListReactionsQueryDto,
  ListReactionsResponseDto,
  ReactionSubjectParamsDto,
  SetReactionBodyDto,
  SetReactionResponseDto,
} from '../../dto/feed';

/**
 * Cảm xúc cho bài đăng và cho bình luận.
 *
 * Một controller cho cả hai vì khác biệt duy nhất là `subjectType` — tách đôi là
 * nhân đôi cùng một đoạn code, và hai bản sao sẽ lệch nhau khi một bên được sửa.
 */
@ApiTags('Tương tác bảng tin')
@Controller()
export class ContentReactionController {
  public constructor(
    @Inject(ISetContentReactionUseCase)
    private readonly setReactionUseCase: ISetContentReactionUseCase,
    @Inject(IRemoveContentReactionUseCase)
    private readonly removeReactionUseCase: IRemoveContentReactionUseCase,
    @Inject(IListContentReactionsUseCase)
    private readonly listReactionsUseCase: IListContentReactionsUseCase,
  ) {}

  @Put('posts/:subjectId/reactions/me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đặt hoặc đổi cảm xúc cho một bài đăng',
    description:
      'Dùng `PUT` chứ không `POST` vì đây là thao tác bình thái — bấm hai lần cho cùng một kết quả, và client retry không phải đoán xem mình vừa tạo mấy cái. ' +
      'Đổi từ `LIKE` sang `LOVE` KHÔNG làm tổng tăng thêm một: vẫn là một người. ' +
      'Cần quyền `REACT_CONTENT` — Admin cấu hình hạng nào được bày tỏ, mặc định VIEWER chỉ đọc.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(SetReactionResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, PostNotFoundException)
  public async setPostReaction(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ReactionSubjectParamsDto,
    @Body() body: SetReactionBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.setReactionUseCase.handle({
          userId: principal.userId,
          subjectType: ContentSubjectTypes.POST,
          subjectId: params.subjectId,
          kind: body.reaction.kind,
        }),
      )
      .build();
  }

  @Delete('posts/:subjectId/reactions/me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gỡ cảm xúc của mình khỏi một bài đăng',
    description:
      'KHÔNG kiểm quyền: người đã bày tỏ thì luôn rút lại được, kể cả khi Admin vừa tắt quyền hoặc hạng của họ vừa tụt.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(SetReactionResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async removePostReaction(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ReactionSubjectParamsDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.removeReactionUseCase.handle({
          userId: principal.userId,
          subjectType: ContentSubjectTypes.POST,
          subjectId: params.subjectId,
        }),
      )
      .build();
  }

  @Public()
  @Get('posts/:subjectId/reactions')
  @ApiOperation({
    summary: 'Ai đã bày tỏ cảm xúc với bài đăng',
    description:
      'Công khai. `summary.myReaction` chỉ khác `null` khi gọi kèm token.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListReactionsResponseDto) })
  public async listPostReactions(
    @CurrentUser() principal: IAuthPrincipal | null,
    @Param() params: ReactionSubjectParamsDto,
    @Query() query: ListReactionsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listReactionsUseCase.handle({
          viewerId: principal?.userId ?? null,
          subjectType: ContentSubjectTypes.POST,
          subjectId: params.subjectId,
          kind: query.kind,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }

  @Put('comments/:subjectId/reactions/me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đặt hoặc đổi cảm xúc cho một bình luận' })
  @ApiOkResponse({ type: ResponseDto.forApi(SetReactionResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async setCommentReaction(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ReactionSubjectParamsDto,
    @Body() body: SetReactionBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.setReactionUseCase.handle({
          userId: principal.userId,
          subjectType: ContentSubjectTypes.COMMENT,
          subjectId: params.subjectId,
          kind: body.reaction.kind,
        }),
      )
      .build();
  }

  @Delete('comments/:subjectId/reactions/me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Gỡ cảm xúc của mình khỏi một bình luận' })
  @ApiOkResponse({ type: ResponseDto.forApi(SetReactionResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async removeCommentReaction(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ReactionSubjectParamsDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.removeReactionUseCase.handle({
          userId: principal.userId,
          subjectType: ContentSubjectTypes.COMMENT,
          subjectId: params.subjectId,
        }),
      )
      .build();
  }
}
