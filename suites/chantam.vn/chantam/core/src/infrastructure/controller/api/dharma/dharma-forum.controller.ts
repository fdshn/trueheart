import {
  ICreateDedicationUseCase,
  ICreateThreadUseCase,
  IGetThreadUseCase,
  IListAdminThreadsUseCase,
  IListOwnDedicationsUseCase,
  IListPublicDedicationsUseCase,
  IListPublicThreadsUseCase,
  IModerateThreadUseCase,
} from '@/application/contracts/dharma';
import {
  ContentBlockedTermsException,
  DharmaRecitationNotFoundException,
  DharmaThreadNotFoundException,
} from '@/domain/exceptions';
import { DharmaThreadStatus } from '@chantam.vn/chantam.core-lib/models';
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
  CreateDedicationBodyDto,
  CreateThreadBodyDto,
  DedicationWrapperResponseDto,
  ListAdminThreadsQueryDto,
  ListOwnDedicationsResponseDto,
  ListPublicDedicationsResponseDto,
  ListThreadsQueryDto,
  ListThreadsResponseDto,
  ModerateThreadBodyDto,
  ThreadIdParamDto,
  ThreadWrapperResponseDto,
} from '../../dto/dharma/dharma-forum.dto';
import { RequiresPermission } from '../../guards';

/**
 * Diễn đàn Phật Pháp và Hồi hướng — đường CÔNG KHAI (UC-DHARMA-03, UC-DHARMA-04).
 *
 * File riêng khỏi controller cần token: `route-order-guard` quét theo FILE.
 */
@ApiTags('Phật Pháp - Diễn đàn')
@Controller('dharma')
export class DharmaForumPublicController {
  public constructor(
    @Inject(IListPublicThreadsUseCase)
    private readonly listThreadsUseCase: IListPublicThreadsUseCase,
    @Inject(IGetThreadUseCase)
    private readonly getThreadUseCase: IGetThreadUseCase,
    @Inject(IListPublicDedicationsUseCase)
    private readonly listDedicationsUseCase: IListPublicDedicationsUseCase,
  ) {}

  @Get('threads')
  @Public()
  @ApiOperation({
    summary: 'Danh sách chủ đề',
    description:
      'Công khai. Chỉ chủ đề `VISIBLE` — chủ đề đang chờ duyệt KHÔNG hiện, vì bộ lọc từ ngữ ' +
      'đã đánh dấu nó cần người thật xem trước.\n\n' +
      'Chủ đề ghim lên đầu, rồi mới nhất trước.\n\n' +
      '`commentCount` và `reactionCount` ĐẾM từ `content_comments` và `content_reactions`, ' +
      'không phải cột lưu sẵn — `posts.comment_count` và `posts.reaction_count` là bản sao ' +
      'của đúng hai bảng đó và chúng đã trôi.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListThreadsResponseDto) })
  public async listThreads(@Query() query: ListThreadsQueryDto) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listThreadsUseCase.handle({
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
          category: query.category,
        }),
      )
      .build();
  }

  @Get('threads/:id')
  @Public()
  @ApiOperation({
    summary: 'Một chủ đề',
    description:
      'Chủ đề chờ duyệt hoặc đã ẩn trả 404 trên đường này: nó chưa (hoặc không còn) hiện ra ' +
      'ngoài, nên sự tồn tại của nó cũng vậy.\n\n' +
      'Thích và bình luận dùng ĐÚNG hai endpoint có sẵn với `subjectType=DHARMA_THREAD` — ' +
      '`POST /content/reactions` và `POST /content/comments`. UC-DHARMA-03 nói tái sử dụng ' +
      'cơ chế hiện có, và `content_subject_type_enum` đã có giá trị đó từ đầu.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ThreadWrapperResponseDto) })
  @ApiErrorResponses([DharmaThreadNotFoundException])
  public async getThread(@Param() param: ThreadIdParamDto) {
    return ResponseDto.create()
      .succeed()
      .attach(await this.getThreadUseCase.handle({ threadId: param.id }))
      .build();
  }

  @Get('dedications')
  @Public()
  @ApiOperation({
    summary: 'Danh sách hồi hướng công khai',
    description:
      'UC-DHARMA-04. Chỉ hàng `isPublic`. Hàng của người chọn ẩn danh hiện "Người ẩn danh" — ' +
      'tên thật **không ra khỏi tầng repository**, câu SQL không kéo nó về.\n\n' +
      'Lưu ý **không nhầm với Công đức**: `/merit-units` giữ số TIỀN tự khai; đường này giữ ' +
      'LỜI hồi hướng. Hai thứ khác nhau dùng chung một từ tiếng Việt.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(ListPublicDedicationsResponseDto),
  })
  public async listDedications(@Query() query: ListThreadsQueryDto) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listDedicationsUseCase.handle({
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
        }),
      )
      .build();
  }
}

/** Đường CẦN token: tạo chủ đề, hồi hướng, xem lại lời của mình. */
@ApiTags('Phật Pháp - Diễn đàn')
@ApiBearerAuth()
@Controller('dharma')
export class DharmaForumController {
  public constructor(
    @Inject(ICreateThreadUseCase)
    private readonly createThreadUseCase: ICreateThreadUseCase,
    @Inject(ICreateDedicationUseCase)
    private readonly createDedicationUseCase: ICreateDedicationUseCase,
    @Inject(IListOwnDedicationsUseCase)
    private readonly listOwnUseCase: IListOwnDedicationsUseCase,
  ) {}

  @Get('dedications/mine')
  @ApiOperation({
    summary: 'Lời hồi hướng của tôi',
    description:
      'GỒM cả hàng không công khai, và KHÔNG ẩn danh — bạn xem lại lời của chính mình.',
  })
  @ApiErrorResponses(...ApiTokenErrors)
  @ApiOkResponse({ type: ResponseDto.forApi(ListOwnDedicationsResponseDto) })
  public async listMine(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListThreadsQueryDto,
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

  @Post('threads')
  @ApiOperation({
    summary: 'Tạo chủ đề',
    description:
      'Chạy qua ĐÚNG bộ lọc từ ngữ của bình luận, và lọc CẢ tiêu đề lẫn nội dung — một tiêu ' +
      'đề bậy là thứ người ta thấy đầu tiên trên danh sách.\n\n' +
      'Bộ lọc cho `BLOCK` thì trả 422 ngay; cho `REVIEW` thì chủ đề vào `PENDING_REVIEW` và ' +
      '**chưa hiện công khai** cho tới khi Admin xử. Đây chính là chữ "duyệt" của ' +
      'UC-DHARMA-03 — không phải một luồng duyệt-trước-khi-hiện cho mọi chủ đề, vì đặc tả ' +
      'cho *"User có thể xem/tạo chủ đề"*.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ContentBlockedTermsException, [
    ValidationFailedException,
    ['bodyText phải có ít nhất 10 ký tự'],
  ])
  @ApiCreatedResponse({ type: ResponseDto.forApi(ThreadWrapperResponseDto) })
  public async createThread(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: CreateThreadBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.createThreadUseCase.handle({
          ...body.thread,
          actorUserId: principal.userId,
        }),
      )
      .build();
  }

  @Post('dedications')
  @ApiOperation({
    summary: 'Viết lời hồi hướng',
    description:
      'UC-DHARMA-04: *"User nhập nội dung hồi hướng/người được hồi hướng, có thể gắn với lần ' +
      'tụng kinh hoặc tạo độc lập; hỗ trợ public/anonymous theo lựa chọn."*\n\n' +
      '`dedicateeName` TUỲ CHỌN — hồi hướng cho tất cả chúng sinh là lời phổ biến nhất và nó ' +
      'không có tên người nhận.\n\n' +
      'Gắn `recitationId` thì lượt tụng đó phải là CỦA BẠN. Thiếu phép kiểm này, một người ' +
      'gắn lời của mình vào lượt tụng của người khác.',
  })
  @ApiErrorResponses(...ApiTokenErrors, DharmaRecitationNotFoundException, [
    ValidationFailedException,
    ['text phải có ít nhất 5 ký tự'],
  ])
  @ApiCreatedResponse({
    type: ResponseDto.forApi(DedicationWrapperResponseDto),
  })
  public async createDedication(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: CreateDedicationBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.createDedicationUseCase.handle({
          ...body.dedication,
          actorUserId: principal.userId,
        }),
      )
      .build();
  }
}

/**
 * Kiểm duyệt diễn đàn.
 *
 * Quyền là `post.moderate` đang có, KHÔNG phải một mã mới. Khác quyết định ở `banner.*` và
 * `merit.*`: ở đó việc là thương mại và tài chính nên cần ô tick riêng; ở đây việc là kiểm
 * duyệt nội dung người dùng — đúng việc `post.moderate` đang làm cho bài và bình luận, và
 * UC-DHARMA-03 nói rõ tái sử dụng cơ chế Moderation hiện có.
 */
@ApiTags('Admin - Phật Pháp')
@ApiBearerAuth()
@Controller('admin/dharma/threads')
export class AdminDharmaForumController {
  public constructor(
    @Inject(IListAdminThreadsUseCase)
    private readonly listUseCase: IListAdminThreadsUseCase,
    @Inject(IModerateThreadUseCase)
    private readonly moderateUseCase: IModerateThreadUseCase,
  ) {}

  @Get()
  @RequiresPermission('post.moderate')
  @ApiOperation({
    summary: 'Danh sách chủ đề, mọi trạng thái',
    description:
      'Lọc `status=PENDING_REVIEW` để ra hàng đợi kiểm duyệt, **cũ nhất trước** — mới nhất ' +
      'trước là để chủ đề bị gắn cờ đầu tiên nằm mãi ở cuối danh sách.\n\n' +
      '`flaggedTerms` cho biết bộ lọc bắt được từ nào, để Admin quyết nhanh mà không phải ' +
      'đọc hết.',
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException)
  @ApiOkResponse({ type: ResponseDto.forApi(ListThreadsResponseDto) })
  public async list(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListAdminThreadsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          actorUserId: principal.userId,
          limit: query.limit ?? 20,
          offset: query.offset ?? 0,
          status: query.status as DharmaThreadStatus | undefined,
        }),
      )
      .build();
  }

  @Patch(':id/moderation')
  @RequiresPermission('post.moderate')
  @ApiOperation({
    summary: 'Duyệt, ẩn, khoá bình luận, ghim',
    description:
      'Bốn việc UC-DHARMA-03 liệt kê, một endpoint — chúng cùng một quyết định nghiệp vụ và ' +
      'cùng ghi một dấu vết `moderatedBy`/`moderatedAt`. Tách bốn endpoint là bốn lượt ghi ' +
      'dấu vết cho một lần quyết.\n\n' +
      '`isLocked` tách khỏi `status`: khoá bình luận mà KHÔNG ẩn chủ đề là việc riêng — một ' +
      'cuộc tranh luận chệch hướng vẫn đáng đọc lại.\n\n' +
      'Không gửi thay đổi nào thì trả 422, chứ không ghi một dấu vết kiểm duyệt rỗng — ' +
      '`moderatedAt` là bằng chứng Admin đã QUYẾT điều gì, và ghi nó cho một lượt gọi không ' +
      'đổi gì làm hàng đợi trông như đã xử lý xong.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    DharmaThreadNotFoundException,
    [
      ValidationFailedException,
      ['phải gửi ít nhất một trong: status, isLocked, isPinned'],
    ],
  )
  @ApiOkResponse({ type: ResponseDto.forApi(ThreadWrapperResponseDto) })
  public async moderate(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() param: ThreadIdParamDto,
    @Body() body: ModerateThreadBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.moderateUseCase.handle({
          actorUserId: principal.userId,
          threadId: param.id,
          status: body.moderation.status as DharmaThreadStatus | undefined,
          isLocked: body.moderation.isLocked,
          isPinned: body.moderation.isPinned,
          note: body.moderation.note,
        }),
      )
      .build();
  }
}
