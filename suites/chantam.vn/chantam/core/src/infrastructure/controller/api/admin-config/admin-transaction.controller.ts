import {
  IGetAdminGiftTransactionUseCase,
  IListAdminGiftTransactionsUseCase,
  IReopenGiftTransactionUseCase,
} from '@/application/contracts/transaction';
import {
  GiftTransactionInvalidStateException,
  GiftTransactionNotFoundException,
  GiftTransactionOutOfStockException,
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
  GetAdminTransactionResponseDto,
  ListAdminTransactionsQueryDto,
  ListAdminTransactionsResponseDto,
  ReopenTransactionBodyDto,
  ReopenTransactionParamsDto,
  ReopenTransactionResponseDto,
} from '../../dto/admin-config/admin-transaction.dto';
import { RequiresPermission } from '../../guards';

@ApiTags('Quản trị — lượt trao')
@ApiBearerAuth()
@Controller('admin/transactions')
export class AdminTransactionController {
  public constructor(
    @Inject(IReopenGiftTransactionUseCase)
    private readonly reopenGiftTransactionUseCase: IReopenGiftTransactionUseCase,
    @Inject(IListAdminGiftTransactionsUseCase)
    private readonly listUseCase: IListAdminGiftTransactionsUseCase,
    @Inject(IGetAdminGiftTransactionUseCase)
    private readonly getUseCase: IGetAdminGiftTransactionUseCase,
  ) {}

  @Get()
  @RequiresPermission('post.read')
  @ApiOperation({
    summary: 'Danh sách lượt trao, có bộ lọc',
    description:
      'Để tìm lượt cần mở lại hay cần xem mà không phải dán UUID. `userId` khớp người tặng HOẶC người nhận. Mới xin trước. Mỗi dòng kèm tên bài và username hai bên.\n\n' +
      'Đọc cần `post.read`; MỞ LẠI vẫn cần `admin.manage`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListAdminTransactionsResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ValidationFailedException, ['userId must be a UUID']],
  )
  public async list(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListAdminTransactionsQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          actorUserId: principal.userId,
          status: query.status,
          userId: query.userId,
          postId: query.postId,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }

  @Get(':transactionId')
  @RequiresPermission('post.read')
  @ApiOperation({
    summary: 'Một lượt trao, kèm ảnh bằng chứng',
    description:
      'Gồm `closedAt`/`closeReason`/`closedBy` và ảnh bàn giao, ảnh nhận, ảnh hàng quay về — đủ để quyết có mở lại hay không.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetAdminTransactionResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ValidationFailedException, ['transactionId must be a UUID']],
    [GiftTransactionNotFoundException],
  )
  public async getOne(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ReopenTransactionParamsDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getUseCase.handle({
          actorUserId: principal.userId,
          transactionId: params.transactionId,
        }),
      )
      .build();
  }

  @Patch(':transactionId/reopen')
  @RequiresPermission('admin.manage')
  @ApiOperation({
    summary: 'Mở lại một lượt trao đã đóng nhầm',
    description:
      'Cả `COMPLETED` lẫn `CANCELLED` đều mở lại được, và về đúng chặng đang dở: có mốc bàn giao thì về `DELIVERING`, không thì về `ACCEPTED`. Phòng chat mở lại theo và đồng hồ xoá bị huỷ — mở lại một cuộc rồi vẫn lấy đi bằng chứng của chính nó là vô nghĩa. Mở lại lượt đã `CANCELLED` phải trừ kho lần nữa và sẽ bị từ chối nếu bài đã hết hàng, vì lúc đó món đồ thật sự đã sang tay người khác. Điểm đã cộng giữ nguyên: sổ điểm là append-only, và khoá chống trùng theo lượt trao nên hoàn tất lần nữa cũng không cộng thêm. `reason` bắt buộc, ghi audit `REOPEN_TRANSACTION`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ReopenTransactionResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [ForbiddenException],
    [ValidationFailedException, ['reason không được để trống']],
    [GiftTransactionNotFoundException],
    [GiftTransactionInvalidStateException, 'ACCEPTED'],
    [GiftTransactionOutOfStockException],
  )
  public async reopen(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ReopenTransactionParamsDto,
    @Body() body: ReopenTransactionBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.reopenGiftTransactionUseCase.handle({
          actorUserId: principal.userId,
          transactionId: params.transactionId,
          reason: body.reopen.reason,
        }),
      )
      .build();
  }
}
