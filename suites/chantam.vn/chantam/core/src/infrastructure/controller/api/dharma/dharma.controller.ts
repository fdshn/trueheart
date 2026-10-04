import {
  ICompleteRecitationUseCase,
  ICreateDharmaContentUseCase,
  IDeleteDharmaContentUseCase,
  IListAdminDharmaContentsUseCase,
  IListOwnRecitationsUseCase,
  IStartRecitationUseCase,
  IUpdateDharmaContentUseCase,
} from '@/application/contracts/dharma';
import {
  DharmaContentNotFoundException,
  DharmaContentNotRecitableException,
  DharmaRecitationAlreadyCompletedException,
  DharmaRecitationNotFoundException,
} from '@/domain/exceptions';
import { DharmaContentType } from '@chantam.vn/chantam.core-lib/models';
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
  DeleteDharmaContentResponseDto,
  DharmaContentIdParamDto,
  DharmaContentWrapperResponseDto,
  DharmaRecitationWrapperResponseDto,
  ListAdminDharmaContentsQueryDto,
  ListDharmaContentsQueryDto,
  ListDharmaContentsResponseDto,
  ListDharmaRecitationsResponseDto,
  PatchDharmaContentBodyDto,
  WriteDharmaContentBodyDto,
} from '../../dto/dharma/dharma.dto';
import { RequiresPermission } from '../../guards';

/**
 * Tụng kinh — đường CẦN token (UC-DHARMA-02).
 *
 * `recitations/mine` khai TRƯỚC `recitations/:recitationId/complete` không bắt buộc (hai
 * route khác độ sâu), nhưng giữ thứ tự đó cho dễ đọc.
 *
 * Phase 1 KHÔNG có AI Voice, karaoke đồng bộ chữ theo audio, livestream hay ghi âm giọng
 * user — UC-DHARMA-02 loại bốn thứ đó ra khỏi phạm vi, nên ở đây không có endpoint nào cho chúng.
 */
@ApiTags('Phật Pháp')
@ApiBearerAuth()
@Controller('dharma')
export class DharmaController {
  public constructor(
    @Inject(IStartRecitationUseCase)
    private readonly startUseCase: IStartRecitationUseCase,
    @Inject(ICompleteRecitationUseCase)
    private readonly completeUseCase: ICompleteRecitationUseCase,
    @Inject(IListOwnRecitationsUseCase)
    private readonly listOwnUseCase: IListOwnRecitationsUseCase,
  ) {}

  @Get('recitations/mine')
  @ApiOperation({
    summary: 'Lịch sử tụng kinh của tôi',
    description:
      'UC-DHARMA-02 đòi *"lưu lịch sử cơ bản"*. Một hàng mỗi LƯỢT tụng, không một hàng mỗi ' +
      '(người, kinh) — tụng một bộ kinh nhiều lần là chính việc người dùng làm, và một hàng ' +
      'một người thì không còn lịch sử nào.',
  })
  @ApiErrorResponses(...ApiTokenErrors)
  @ApiOkResponse({ type: ResponseDto.forApi(ListDharmaRecitationsResponseDto) })
  public async listMine(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListDharmaContentsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listOwnUseCase.handle({
          actorUserId: principal.userId,
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
        }),
      )
      .build();
  }

  @Patch('recitations/:recitationId/complete')
  @ApiOperation({
    summary: 'Đánh dấu đã tụng xong',
    description:
      '`durationSeconds` tính ở **database** từ `startedAt` tới `now()`, KHÔNG nhận từ client ' +
      '— một con số do client gửi là con số người dùng sửa được, và "đã tụng 3 tiếng" thành ' +
      'thứ bịa được.\n\n' +
      'MỘT CHIỀU. Chỉ người tụng đánh dấu được, và phép kiểm đó nằm trong `WHERE` của chính ' +
      'câu `UPDATE` — lượt tụng của người khác trả 404 chứ không 403, vì ai dò id không nên ' +
      'biết người khác đang tụng gì.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    DharmaRecitationNotFoundException,
    DharmaRecitationAlreadyCompletedException,
  )
  @ApiOkResponse({
    type: ResponseDto.forApi(DharmaRecitationWrapperResponseDto),
  })
  public async complete(
    @CurrentUser() principal: IAuthPrincipal,
    @Param('recitationId') recitationId: string,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.completeUseCase.handle({
          actorUserId: principal.userId,
          recitationId,
        }),
      )
      .build();
  }

  @Post('contents/:id/recitations')
  @ApiOperation({
    summary: 'Bắt đầu một lượt tụng',
    description:
      'Chỉ `SUTRA` đã xuất bản. Mở cho `INFO`/`TEMPLE_INTRO` là cho người dùng "đánh dấu đã ' +
      'tụng xong" một trang giới thiệu chùa, và lịch sử tụng mất nghĩa — trả 409.\n\n' +
      'Bản nháp trả 404 chứ không 403: nó chưa công khai, nên sự tồn tại của nó cũng chưa công khai.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    DharmaContentNotFoundException,
    DharmaContentNotRecitableException,
  )
  @ApiCreatedResponse({
    type: ResponseDto.forApi(DharmaRecitationWrapperResponseDto),
  })
  public async start(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: DharmaContentIdParamDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.startUseCase.handle({
          actorUserId: principal.userId,
          contentId: param.id,
        }),
      )
      .build();
  }
}

/**
 * Quản trị nội dung Phật Pháp (UC-DHARMA-01).
 *
 * Quyền là cặp riêng `dharma.read` / `dharma.manage`, không dùng lại `blog.*`: nội dung ở đây
 * là kinh sách, và một bản kinh sai chữ là chuyện khác hẳn một bài tin sai chính tả. Xem
 * migration `1799000000000`.
 */
@ApiTags('Admin - Phật Pháp')
@ApiBearerAuth()
@Controller('admin/dharma/contents')
export class AdminDharmaController {
  public constructor(
    @Inject(IListAdminDharmaContentsUseCase)
    private readonly listUseCase: IListAdminDharmaContentsUseCase,
    @Inject(ICreateDharmaContentUseCase)
    private readonly createUseCase: ICreateDharmaContentUseCase,
    @Inject(IUpdateDharmaContentUseCase)
    private readonly updateUseCase: IUpdateDharmaContentUseCase,
    @Inject(IDeleteDharmaContentUseCase)
    private readonly deleteUseCase: IDeleteDharmaContentUseCase,
  ) {}

  @Get()
  @RequiresPermission('dharma.read')
  @ApiOperation({
    summary: 'Danh sách nội dung, gồm cả bản nháp',
    description:
      'Sắp theo `COALESCE(publishedAt, createdAt)` giảm dần — nếu sắp theo `publishedAt` thì ' +
      'mọi nháp dồn xuống cuối với `null`, và Admin vừa lưu nháp xong không thấy nó ở đâu. ' +
      'Đúng lỗi phân hệ Blog đã sửa.\n\n' +
      'Quyền `dharma.read`.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException)
  @ApiOkResponse({ type: ResponseDto.forApi(ListDharmaContentsResponseDto) })
  public async list(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListAdminDharmaContentsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          actorUserId: principal.userId,
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
          contentType: query.contentType as DharmaContentType | undefined,
          includeDrafts: query.includeDrafts ?? true,
        }),
      )
      .build();
  }

  @Post()
  @RequiresPermission('dharma.manage')
  @ApiOperation({
    summary: 'Soạn nội dung mới',
    description:
      'Bản nháp thiếu thứ vẫn lưu được; chỉ lượt **xuất bản** mới đòi đủ nội dung. Admin soạn ' +
      'một bộ kinh qua nhiều buổi là chuyện thường, và chặn lưu nháp là buộc họ dán xong 600 ' +
      'nghìn ký tự trong một lần ngồi.\n\n' +
      'Quyền `dharma.manage`.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException, [
    ValidationFailedException,
    ['bodyText không được rỗng khi xuất bản'],
  ])
  @ApiCreatedResponse({
    type: ResponseDto.forApi(DharmaContentWrapperResponseDto),
  })
  public async create(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: WriteDharmaContentBodyDto,
  ) {
    const content = await this.createUseCase.handle({
      ...body.content,
      actorUserId: principal.userId,
    });

    return ResponseDto.create().succeed().attach({ content }).build();
  }

  @Patch(':id')
  @RequiresPermission('dharma.manage')
  @ApiOperation({
    summary: 'Sửa nội dung',
    description:
      'Chỉ sửa những trường có gửi. Bật `isPublished` mà không gửi `bodyText` thì phép kiểm ' +
      'soi **bản đã lưu** — thiếu điều đó thì `CHK_dharma_contents_published_has_body` ném một ' +
      'lỗi ràng buộc thay vì một thông báo đọc được.\n\n' +
      '`publishedAt` chỉ đặt ở lượt xuất bản ĐẦU: ghi `now()` mỗi lượt sửa là đẩy một bộ kinh ' +
      'cũ lên đầu danh sách "mới xuất bản" chỉ vì ai đó sửa một dấu phẩy.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    DharmaContentNotFoundException,
    [ValidationFailedException, ['bodyText không được rỗng khi xuất bản']],
  )
  @ApiOkResponse({ type: ResponseDto.forApi(DharmaContentWrapperResponseDto) })
  public async update(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: DharmaContentIdParamDto,
    @Body() body: PatchDharmaContentBodyDto,
  ) {
    const content = await this.updateUseCase.handle({
      ...body.content,
      actorUserId: principal.userId,
      contentId: param.id,
    });

    return ResponseDto.create().succeed().attach({ content }).build();
  }

  @Delete(':id')
  @RequiresPermission('dharma.manage')
  @ApiOperation({
    summary: 'Xoá nội dung',
    description:
      'Xoá MỀM, và rút khỏi trạng thái xuất bản luôn. `dharma_recitations` có ' +
      '`ON DELETE CASCADE`, nên xoá cứng một bộ kinh là xoá sạch lịch sử tụng của mọi người ' +
      'đã tụng nó.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    DharmaContentNotFoundException,
  )
  @ApiOkResponse({
    type: ResponseDto.forApi(DeleteDharmaContentResponseDto),
  })
  public async remove(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: DharmaContentIdParamDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.deleteUseCase.handle({
          actorUserId: principal.userId,
          contentId: param.id,
        }),
      )
      .build();
  }
}
