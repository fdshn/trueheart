import {
  IAcceptGiftRequestUseCase,
  ICancelGiftTransactionUseCase,
  IConfirmGiftReceiptUseCase,
  IListOwnGiftTransactionsUseCase,
  IReportShipUnpaidUseCase,
  IRequestGiftUseCase,
} from '@/application/contracts/transaction';
import {
  GiftTransactionDuplicateRequestException,
  GiftTransactionInvalidStateException,
  GiftTransactionNotFoundException,
  GiftTransactionNotParticipantException,
  GiftTransactionOutOfStockException,
  ShipPayerNotReceiverException,
} from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import type { ApiErrorSpec } from '@chantam/service.common-lib/decorators';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CancelGiftTransactionBodyDto,
  GiftTransactionParamsDto,
  GiftTransactionResponseDto,
  ListGiftTransactionsResponseDto,
  ReportShipUnpaidBodyDto,
  ReportShipUnpaidParamsDto,
  ReportShipUnpaidResponseDto,
  RequestGiftBodyDto,
} from '../../dto/transaction';

const ParticipantErrors: ApiErrorSpec[] = [
  [GiftTransactionNotFoundException],
  [GiftTransactionNotParticipantException],
  [GiftTransactionInvalidStateException, 'COMPLETED'],
];

@ApiTags('Giao dịch tặng/nhận')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionController {
  public constructor(
    @Inject(IRequestGiftUseCase)
    private readonly requestGiftUseCase: IRequestGiftUseCase,
    @Inject(IAcceptGiftRequestUseCase)
    private readonly acceptGiftRequestUseCase: IAcceptGiftRequestUseCase,
    @Inject(IConfirmGiftReceiptUseCase)
    private readonly confirmGiftReceiptUseCase: IConfirmGiftReceiptUseCase,
    @Inject(IReportShipUnpaidUseCase)
    private readonly reportShipUnpaidUseCase: IReportShipUnpaidUseCase,
    @Inject(ICancelGiftTransactionUseCase)
    private readonly cancelGiftTransactionUseCase: ICancelGiftTransactionUseCase,
    @Inject(IListOwnGiftTransactionsUseCase)
    private readonly listOwnGiftTransactionsUseCase: IListOwnGiftTransactionsUseCase,
  ) {}

  @Get('me')
  @ApiOperation({
    summary: 'Các lượt tặng/nhận của chính mình',
    description:
      'Gồm CẢ HAI vai: lượt mình đem tặng và lượt mình xin nhận. Sắp xếp theo thời điểm yêu cầu, mới nhất trước. Đọc `giverId`/`receiverId` để biết mình đang ở vai nào trong từng lượt.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(ListGiftTransactionsResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors)
  public async listOwnTransactions(@CurrentUser() principal: IAuthPrincipal) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listOwnGiftTransactionsUseCase.handle({
          userId: principal.userId,
        }),
      )
      .build();
  }

  @Post()
  @ApiOperation({
    summary: 'Xin một suất từ bài đăng',
    description:
      'Người nhận luôn là chủ token; không nhận receiverId từ body. Mỗi người chỉ có một yêu cầu đang mở trên một bài.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(GiftTransactionResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [GiftTransactionNotFoundException],
    [GiftTransactionNotParticipantException],
    [GiftTransactionInvalidStateException, 'PENDING_REVIEW'],
    [GiftTransactionOutOfStockException],
    [GiftTransactionDuplicateRequestException],
  )
  public async requestGift(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: RequestGiftBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.requestGiftUseCase.handle({
          userId: principal.userId,
          giftRequest: body.giftRequest,
        }),
      )
      .build();
  }

  @Post(':transactionId/accept')
  @ApiOperation({
    summary: 'Người tặng duyệt một yêu cầu',
    description:
      'Trừ số lượng còn lại của bài ngay trong cùng transaction, nên hai lượt duyệt song song không thể vượt tồn kho.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GiftTransactionResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ...ParticipantErrors, [
    GiftTransactionOutOfStockException,
  ])
  public async acceptGiftRequest(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: GiftTransactionParamsDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.acceptGiftRequestUseCase.handle({
          userId: principal.userId,
          transactionId: params.transactionId,
        }),
      )
      .build();
  }

  @Post(':transactionId/confirm')
  @ApiOperation({
    summary: 'Người nhận xác nhận đã nhận',
    description:
      'Đây là mốc tính hoạt động cho rank. Quá 5 ngày mà chưa xác nhận thì job ngoài tiến trình tự hoàn tất.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GiftTransactionResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ...ParticipantErrors)
  public async confirmGiftReceipt(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: GiftTransactionParamsDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.confirmGiftReceiptUseCase.handle({
          userId: principal.userId,
          transactionId: params.transactionId,
        }),
      )
      .build();
  }

  @Post(':transactionId/reports/ship-unpaid')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Báo người nhận không thanh toán phí ship',
    description:
      'Chỉ NGƯỜI GỬI báo được — chỉ họ mới thấy hàng bị hoàn về; cho người nhận báo là cho chính người bị phạt quyết định có bị phạt hay không. Chỉ áp dụng khi bài khai `shipPayer = RECEIVER`. Khoản trừ đi qua point ledger với khoá chống trùng theo lượt trao, nên báo hai lần chỉ trừ một lần (`penaltyApplied: false` ở lần sau). Số điểm lấy từ point rule SHIP_UNPAID_PENALTY nên Admin chỉnh được.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(ReportShipUnpaidResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    GiftTransactionNotFoundException,
    [GiftTransactionNotParticipantException],
    ShipPayerNotReceiverException,
  )
  public async reportShipUnpaid(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ReportShipUnpaidParamsDto,
    @Body() body: ReportShipUnpaidBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.reportShipUnpaidUseCase.handle({
          transactionId: params.transactionId,
          userId: principal.userId,
          reason: body.report.reason,
        }),
      )
      .build();
  }

  @Post(':transactionId/cancel')
  @ApiOperation({
    summary: 'Huỷ lượt tặng/nhận',
    description:
      'Cả người tặng lẫn người nhận đều huỷ được khi chưa hoàn tất. Đã duyệt thì số lượng được trả lại cho bài đăng.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GiftTransactionResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ...ParticipantErrors)
  public async cancelGiftTransaction(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: GiftTransactionParamsDto,
    @Body() body: CancelGiftTransactionBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.cancelGiftTransactionUseCase.handle({
          userId: principal.userId,
          transactionId: params.transactionId,
          cancellation: body.cancellation,
        }),
      )
      .build();
  }
}
