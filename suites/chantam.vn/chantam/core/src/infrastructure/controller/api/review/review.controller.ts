import {
  IEditReviewUseCase,
  IGetTransactionReviewsUseCase,
  ISubmitReviewUseCase,
} from '@/application/contracts/review';
import {
  GiftTransactionNotFoundException,
  ReviewAlreadyEditedException,
  ReviewAlreadySubmittedException,
  ReviewEditWindowClosedException,
  ReviewNotFoundException,
  ReviewTransactionNotCompletedException,
} from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  EditReviewBodyDto,
  GetTransactionReviewsResponseDto,
  SubmitReviewBodyDto,
  SubmitReviewResponseDto,
  TransactionReviewParamsDto,
} from '../../dto/review';

@ApiTags('Đánh giá sau giao dịch')
@Controller('transactions')
export class ReviewController {
  public constructor(
    @Inject(ISubmitReviewUseCase)
    private readonly submitReviewUseCase: ISubmitReviewUseCase,
    @Inject(IEditReviewUseCase)
    private readonly editReviewUseCase: IEditReviewUseCase,
    @Inject(IGetTransactionReviewsUseCase)
    private readonly getReviewsUseCase: IGetTransactionReviewsUseCase,
  ) {}

  @Post(':transactionId/reviews')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đánh giá sau khi lượt trao hoàn tất',
    description:
      'Hai bên cùng đánh giá, mỗi người ĐÚNG một lần, và chỉ sau khi lượt trao `COMPLETED` (F42). ' +
      'Bên NHẬN bắt buộc chấm thêm `accuracyPercent` — mức chính xác của mô tả so với hàng thật (F43); bên TẶNG không chấm mục này. ' +
      'Chỉ số tổng hợp chỉ công bố khi đã đủ 5 mẫu, và dưới 75% thì hồ sơ vào diện Admin xem xét chứ KHÔNG bị phạt tự động. ' +
      'Sửa được ĐÚNG một lần qua `PATCH`, trong `review.grace.graceDays` ngày sau khi hoàn tất; ngoài lần đó thì không sửa và không xoá được.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(SubmitReviewResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    GiftTransactionNotFoundException,
    ReviewTransactionNotCompletedException,
    ReviewAlreadySubmittedException,
  )
  public async submitReview(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: TransactionReviewParamsDto,
    @Body() body: SubmitReviewBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.submitReviewUseCase.handle({
          userId: principal.userId,
          transactionId: params.transactionId,
          review: body.review,
        }),
      )
      .build();
  }

  @Patch(':transactionId/reviews/mine')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sửa đánh giá của chính mình (CHỐT-10 mục 4)',
    description:
      'Mỗi bên sửa đánh giá của mình ĐÚNG một lần, trước `completed_at + review.grace.graceDays` ngày — đọc hạn đó ở `myEditableUntil` của `GET .../reviews`. ' +
      'Body mang một bản đánh giá ĐẦY ĐỦ, không phải bản vá từng trường: bỏ trống `comment` là XOÁ bình luận, không phải giữ nguyên. ' +
      'Bản trước lần sửa được database giữ lại cho đối soát và không trả ra API. ' +
      'Sau hạn thì khoá, vì đúng mốc đó `value_bonus` của người tặng được chốt theo bản đánh giá cuối.',
  })
  @ApiOkResponse({ type: ResponseDto.forApi(SubmitReviewResponseDto) })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    GiftTransactionNotFoundException,
    ReviewTransactionNotCompletedException,
    ReviewNotFoundException,
    ReviewAlreadyEditedException,
    [ReviewEditWindowClosedException, [7]],
  )
  public async editReview(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: TransactionReviewParamsDto,
    @Body() body: EditReviewBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.editReviewUseCase.handle({
          userId: principal.userId,
          transactionId: params.transactionId,
          review: body.review,
        }),
      )
      .build();
  }

  @Get(':transactionId/reviews')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đánh giá của một lượt trao',
    description:
      'Chỉ hai bên trong lượt trao đọc được. Đánh giá của bên kia chỉ hiện SAU khi bạn đã gửi của mình — đọc trước rồi mới chấm là mời nhau trả đũa, và điểm số sẽ đo quan hệ chứ không đo trải nghiệm.',
  })
  @ApiOkResponse({
    type: ResponseDto.forApi(GetTransactionReviewsResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors, GiftTransactionNotFoundException)
  public async getReviews(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: TransactionReviewParamsDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.getReviewsUseCase.handle({
          userId: principal.userId,
          transactionId: params.transactionId,
        }),
      )
      .build();
  }
}
