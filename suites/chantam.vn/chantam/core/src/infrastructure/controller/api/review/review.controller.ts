import {
  IGetTransactionReviewsUseCase,
  ISubmitReviewUseCase,
} from '@/application/contracts/review';
import {
  GiftTransactionNotFoundException,
  ReviewAlreadySubmittedException,
  ReviewTransactionNotCompletedException,
} from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
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
      'Đánh giá chỉ ghi thêm, không sửa được về sau.',
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
