import { IReopenGiftTransactionUseCase } from '@/application/contracts/transaction';
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
import { Body, Controller, Inject, Param, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
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
  ) {}

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
