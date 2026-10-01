import {
  IAcceptGiftRequestUseCase,
  IBatchAcceptRequestsUseCase,
  ICreateGiftRequestUseCase,
  IGetRedemptionQuoteUseCase,
  IListPostRequestsUseCase,
  IOfferGiftUseCase,
  IRedeemPostWithPointsUseCase,
  IRejectGiftRequestUseCase,
  IWithdrawGiftRequestUseCase,
} from '@/application/contracts/gift-request';
import {
  CannotRequestOwnPostException,
  GiftRequestDuplicatedException,
  GiftRequestNotFoundException,
  GiftTransactionInvalidStateException,
  GiftTransactionOutOfStockException,
  OfferGiftSourceInvalidException,
  OfferGiftTargetNotWantedException,
  PostInvalidStateException,
  PostNotAcceptingRequestsException,
  PostNotFoundException,
  RedemptionInsufficientPointsException,
  RedemptionNotAvailableException,
  RedemptionPriceUnavailableException,
} from '@/domain/exceptions';
import {
  IAcceptGiftRequestResponseDto,
  IBatchAcceptRequestsResponseDto,
  ICreateGiftRequestResponseDto,
  IGetPostRequestsResponseDto,
  IOfferGiftResponseDto,
  IRedeemPostWithPointsResponseDto,
  IRedemptionQuoteResponseDto,
  IWithdrawGiftRequestResponseDto,
} from '@chantam.vn/chantam.core-lib/dto';
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
  AcceptGiftRequestParamDto,
  AcceptGiftRequestResponseDto,
  BatchAcceptRequestsBodyDto,
  BatchAcceptRequestsParamDto,
  BatchAcceptRequestsResponseDto,
  CreateGiftRequestBodyDto,
  CreateGiftRequestParamDto,
  CreateGiftRequestResponseDto,
  GetPostRequestsResponseDto,
  ListPostRequestsParamDto,
  ListPostRequestsQueryDto,
  OfferGiftBodyDto,
  OfferGiftParamDto,
  OfferGiftResponseDto,
  RedeemPostWithPointsParamDto,
  RedeemPostWithPointsResponseDto,
  RedemptionQuoteResponseDto,
  RejectGiftRequestParamDto,
  RejectGiftRequestResponseDto,
  WithdrawGiftRequestParamDto,
  WithdrawGiftRequestResponseDto,
} from '../../dto/gift-request';

@ApiTags('Yêu cầu nhận quà')
@Controller('posts')
export class GiftRequestController {
  public constructor(
    @Inject(ICreateGiftRequestUseCase)
    private readonly createGiftRequestUseCase: ICreateGiftRequestUseCase,
    @Inject(IWithdrawGiftRequestUseCase)
    private readonly withdrawGiftRequestUseCase: IWithdrawGiftRequestUseCase,
    @Inject(IListPostRequestsUseCase)
    private readonly listPostRequestsUseCase: IListPostRequestsUseCase,
    @Inject(IAcceptGiftRequestUseCase)
    private readonly acceptGiftRequestUseCase: IAcceptGiftRequestUseCase,
    @Inject(IBatchAcceptRequestsUseCase)
    private readonly batchAcceptRequestsUseCase: IBatchAcceptRequestsUseCase,
    @Inject(IRedeemPostWithPointsUseCase)
    private readonly redeemPostWithPointsUseCase: IRedeemPostWithPointsUseCase,
    @Inject(IGetRedemptionQuoteUseCase)
    private readonly getRedemptionQuoteUseCase: IGetRedemptionQuoteUseCase,
    @Inject(IRejectGiftRequestUseCase)
    private readonly rejectGiftRequestUseCase: IRejectGiftRequestUseCase,
    @Inject(IOfferGiftUseCase)
    private readonly offerGiftUseCase: IOfferGiftUseCase,
  ) {}

  @Post(':postId/requests')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gửi yêu cầu xin nhận đồ',
    description:
      'Người dùng gửi yêu cầu xin đồ (kèm lời nhắn tối đa 500 ký tự). Mỗi người chỉ có 1 yêu cầu hiệu lực cho 1 bài.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(CreateGiftRequestResponseDto),
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [
      ValidationFailedException,
      ['message: message must be longer than or equal to 1 characters'],
    ],
    [PostNotFoundException, 'Post không tồn tại'],
    [
      CannotRequestOwnPostException,
      'Không thể gửi yêu cầu xin nhận bài đăng của chính mình',
    ],
    [
      PostNotAcceptingRequestsException,
      'Bài đăng hiện không tiếp nhận yêu cầu',
    ],
    [GiftRequestDuplicatedException, 'Bạn đã gửi yêu cầu cho bài đăng này rồi'],
  )
  public async createGiftRequest(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CreateGiftRequestParamDto,
    @Body() body: CreateGiftRequestBodyDto,
  ): Promise<ResponseDto<ICreateGiftRequestResponseDto>> {
    const result = await this.createGiftRequestUseCase.handle({
      postId: params.postId,
      requesterId: principal.userId,
      message: body.message,
    });

    return ResponseDto.create<ICreateGiftRequestResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Post(':postId/requests/withdraw')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rút yêu cầu xin nhận đồ',
    description:
      'Người dùng tự rút lại yêu cầu xin đồ nếu đang ở trạng thái PENDING.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(WithdrawGiftRequestResponseDto),
  })
  // Không còn PENDING, hoặc không tồn tại, đều trả về cùng một lỗi: câu UPDATE
  // có điều kiện không phân biệt được hai trường hợp, và cũng không cần.
  @ApiErrorResponses(...ApiTokenErrors, [
    GiftRequestNotFoundException,
    'Không tìm thấy yêu cầu nhận quà',
  ])
  public async withdrawGiftRequest(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: WithdrawGiftRequestParamDto,
  ): Promise<ResponseDto<IWithdrawGiftRequestResponseDto>> {
    const result = await this.withdrawGiftRequestUseCase.handle({
      postId: params.postId,
      requesterId: principal.userId,
    });

    return ResponseDto.create<IWithdrawGiftRequestResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Get(':postId/requests')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Danh sách người xin nhận đồ',
    description:
      'Chỉ tác giả của bài đăng mới có thể xem danh sách các yêu cầu nhận đồ.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(GetPostRequestsResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [PostNotFoundException, 'Post không tồn tại'],
    [ForbiddenException],
  )
  public async listPostRequests(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: ListPostRequestsParamDto,
    @Query() query: ListPostRequestsQueryDto,
  ): Promise<ResponseDto<IGetPostRequestsResponseDto>> {
    const result = await this.listPostRequestsUseCase.handle({
      ...query,
      postId: params.postId,
      currentUserId: principal.userId,
    });

    return ResponseDto.create<IGetPostRequestsResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Post(':postId/requests/:requestId/accept')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Duyệt người xin nhận đồ (Chọn ứng viên)',
    description:
      'Chỉ tác giả của bài đăng mới có thể duyệt người xin nhận. Yêu cầu được duyệt chuyển sang ACCEPTED và một lượt giao dịch được tạo. Bài đăng CHỈ chuyển sang RESERVED khi đã hết số lượng — còn hàng thì vẫn PUBLISHED để người khác tiếp tục xin, và chỉ khi hết hàng mới đẩy các yêu cầu PENDING còn lại sang STANDBY.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(AcceptGiftRequestResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [PostNotFoundException, 'Post không tồn tại'],
    [GiftRequestNotFoundException, 'Không tìm thấy yêu cầu nhận quà'],
    [PostInvalidStateException, 'Bài đăng không ở trạng thái hợp lệ để duyệt'],
    [ForbiddenException],
    [GiftTransactionOutOfStockException],
    // Lượt bàn giao đã được duyệt ở luồng /transactions rồi.
    [GiftTransactionInvalidStateException, 'ACCEPTED'],
  )
  public async acceptGiftRequest(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: AcceptGiftRequestParamDto,
  ): Promise<ResponseDto<IAcceptGiftRequestResponseDto>> {
    const result = await this.acceptGiftRequestUseCase.handle({
      postId: params.postId,
      requestId: params.requestId,
      userId: principal.userId,
    });

    return ResponseDto.create<IAcceptGiftRequestResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Post(':wantedPostId/offer-gift')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Chủ động tặng đồ cho một bài Muốn Nhận',
    description:
      'Dành cho người CÓ món mà bài Muốn Nhận đang cần (SRS §19). Kèm được một ' +
      'bài Muốn Tặng của chính bạn để chủ bài xem ảnh và vị trí món đồ thay vì ' +
      'chỉ đọc một dòng chữ.\n\n' +
      'Về dữ liệu đây CHÍNH LÀ một yêu cầu trên bài đó, nên nó đi qua đúng hàng ' +
      'đợi, đúng hạn mức `OPEN_REQUEST_QUOTA`, đúng cổng hồ sơ (F07) và đúng ' +
      'đường duyệt như `POST /posts/{postId}/requests`. Khác biệt duy nhất là ' +
      'endpoint này từ chối bài không phải loại Muốn Nhận, và nhận thêm ' +
      '`offeringPostId`.\n\n' +
      'Gửi lại trên cùng một bài sau khi đã rút thì `offeringPostId` bị GHI ĐÈ ' +
      'theo lần gửi mới — kể cả ghi đè thành `null`.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(OfferGiftResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [PostNotFoundException, 'Post không tồn tại'],
    [OfferGiftTargetNotWantedException],
    [OfferGiftSourceInvalidException],
    [CannotRequestOwnPostException],
    [GiftRequestDuplicatedException],
    [PostNotAcceptingRequestsException],
  )
  public async offerGift(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: OfferGiftParamDto,
    @Body() body: OfferGiftBodyDto,
  ): Promise<ResponseDto<IOfferGiftResponseDto>> {
    const result = await this.offerGiftUseCase.handle({
      wantedPostId: params.wantedPostId,
      offererId: principal.userId,
      message: body.message,
      offeringPostId: body.offeringPostId,
    });

    return ResponseDto.create<IOfferGiftResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Post(':postId/batch-accept')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Duyệt nhiều người xin nhận trong một lượt',
    description:
      'Dành cho bài số lượng lớn (UC-TRANS-05). Cả lô chạy trong MỘT transaction: ' +
      'hoặc duyệt hết, hoặc không ai được duyệt.\n\n' +
      'Khác với việc gọi `POST /posts/{postId}/requests/{requestId}/accept` nhiều ' +
      'lần ở chỗ **nguyên tử**, và khác biệt đó hiện ra khi lô ĐÔNG HƠN số suất ' +
      'còn lại: gọi nhiều lần sẽ duyệt được tới khi cạn suất rồi trả ' +
      '`GIFT_REQUEST_NOT_FOUND` cho những người còn lại (họ vừa bị đẩy sang ' +
      '`STANDBY` theo F33), trong khi các lượt trước đã commit và bài đã ' +
      '`RESERVED` — duyệt một phần, không có đường lùi. Lô thì từ chối trọn vẹn.\n\n' +
      'Khi số yêu cầu bằng đúng số suất thì cả hai đường cho cùng kết quả; ' +
      'endpoint này vẫn gọn hơn vì chỉ một lượt đi database và một lần lấy khoá.\n\n' +
      'Thiếu suất cho đủ số yêu cầu gửi lên thì trả ' +
      '`GIFT_TRANSACTION_OUT_OF_STOCK` và KHÔNG ghi gì. Một id không còn `PENDING` ' +
      'thì trả `GIFT_REQUEST_NOT_FOUND` kèm đúng id đó, cũng không ghi gì.\n\n' +
      'Mỗi người được duyệt có một lượt trao và một phòng chat riêng, y như duyệt ' +
      'từng cái.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(BatchAcceptRequestsResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [PostNotFoundException, 'Post không tồn tại'],
    [GiftRequestNotFoundException, 'Không tìm thấy yêu cầu nhận quà'],
    [PostInvalidStateException, 'Bài đăng không ở trạng thái hợp lệ để duyệt'],
    [ForbiddenException],
    [GiftTransactionOutOfStockException],
    [GiftTransactionInvalidStateException, 'ACCEPTED'],
    [ValidationFailedException, ['requestIds: không được trùng nhau']],
  )
  public async batchAcceptRequests(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: BatchAcceptRequestsParamDto,
    @Body() body: BatchAcceptRequestsBodyDto,
  ): Promise<ResponseDto<IBatchAcceptRequestsResponseDto>> {
    const result = await this.batchAcceptRequestsUseCase.handle({
      postId: params.postId,
      userId: principal.userId,
      requestIds: body.requestIds,
    });

    return ResponseDto.create<IBatchAcceptRequestsResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Post(':postId/requests/:requestId/reject')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Từ chối một yêu cầu xin nhận',
    description:
      'Chỉ tác giả bài đăng. Trước 28/09 `REJECTED` là trạng thái CHẾT — khai trong enum, lọc ra khỏi bộ đếm, nhưng không đường nào ghi. Nghĩa là chủ bài thấy một yêu cầu rõ ràng không ổn cũng không gạt ra được, và nếu hết đồng hồ mà chưa kịp chọn ai khác thì auto-select có thể trao đúng cho người đó. Chỉ đụng `PENDING` và `STANDBY`: từ chối một yêu cầu đã `ACCEPTED` là huỷ một lượt trao đang sống, việc đó thuộc luồng `/transactions`.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(RejectGiftRequestResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [PostNotFoundException, 'Post không tồn tại'],
    [GiftRequestNotFoundException, 'Không tìm thấy yêu cầu nhận quà'],
    [ForbiddenException],
  )
  public async rejectGiftRequest(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: RejectGiftRequestParamDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.rejectGiftRequestUseCase.handle({
          postId: params.postId,
          requestId: params.requestId,
          userId: principal.userId,
        }),
      )
      .build();
  }

  @Get(':postId/redemption-quote')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Xem trước một lượt đổi vật phẩm bằng điểm',
    description:
      'Trả giá bằng điểm, tỷ lệ quy đổi đang áp, số điểm bạn đang có, và **có tụt hạng hay không** nếu bấm đổi. ' +
      'Luôn trả 200 kèm lý do thay vì ném lỗi — đây là màn hình xem trước, client chỉ cần biết hiện nút hay không và nếu không thì vì sao; `POST /posts/:postId/redeem` mới là chỗ ném lỗi thật. ' +
      'Tính giá bằng ĐÚNG hàm mà đường bấm thật dùng, nên không có chuyện thấy một giá rồi bị trừ một giá khác.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(RedemptionQuoteResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors)
  public async getRedemptionQuote(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: RedeemPostWithPointsParamDto,
  ): Promise<ResponseDto<IRedemptionQuoteResponseDto>> {
    const result = await this.getRedemptionQuoteUseCase.handle({
      postId: params.postId,
      userId: principal.userId,
    });

    return ResponseDto.create<IRedemptionQuoteResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }

  @Post(':postId/redeem')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Dùng điểm đổi thẳng vật phẩm (F75)',
    description:
      'Chốt ngay người nhận mà không chờ hết đồng hồ 7 ngày. Ba điều kiện: đồng hồ đang chạy, người gọi ĐÃ gửi yêu cầu xin nhận, và bài có khai giá trị tham khảo. Số điểm = giá trị tham khảo chia tỷ lệ quy đổi (Admin cấu hình), làm tròn LÊN. Điểm bị trừ trước khi duyệt và được hoàn lại nếu không chốt được.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(RedeemPostWithPointsResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    [
      RedemptionNotAvailableException,
      'Đồng hồ chưa mở, đã hết, bài đã có chủ, hoặc bạn chưa gửi yêu cầu xin nhận',
    ],
    [RedemptionPriceUnavailableException, 'Bài chưa khai giá trị tham khảo'],
    [RedemptionInsufficientPointsException, 'Không đủ điểm'],
    [GiftTransactionOutOfStockException],
    [GiftTransactionInvalidStateException, 'ACCEPTED'],
  )
  public async redeemPostWithPoints(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: RedeemPostWithPointsParamDto,
  ): Promise<ResponseDto<IRedeemPostWithPointsResponseDto>> {
    const result = await this.redeemPostWithPointsUseCase.handle({
      postId: params.postId,
      requesterId: principal.userId,
    });

    return ResponseDto.create<IRedeemPostWithPointsResponseDto>()
      .succeed()
      .attach(result)
      .build();
  }
}
