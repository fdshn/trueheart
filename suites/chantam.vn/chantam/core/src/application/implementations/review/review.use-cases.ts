import {
  IAwardGiftCompletionUseCase,
  IGetTransactionReviewsCommand,
  IGetTransactionReviewsResult,
  IGetTransactionReviewsUseCase,
  ISubmitReviewCommand,
  ISubmitReviewResult,
  ISubmitReviewUseCase,
} from '@/application/contracts/review';
import {
  GiftTransactionNotFoundException,
  ReviewAlreadySubmittedException,
  ReviewTransactionNotCompletedException,
} from '@/domain/exceptions';
import { ITransactionReviewRepository } from '@/domain/ports/repository';
import { ITransactionReviewDto } from '@chantam.vn/chantam.core-lib/dto';
import { ITransactionReviewEntity } from '@chantam.vn/chantam.core-lib/entities';
import { TransactionReviewRoles } from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

function toDto(review: ITransactionReviewEntity): ITransactionReviewDto {
  return {
    reviewId: review.globalId,
    transactionId: review.transactionId,
    reviewerId: review.reviewerId,
    revieweeId: review.revieweeId,
    reviewerRole: review.reviewerRole,
    rating: review.rating,
    accuracyPercent: review.accuracyPercent,
    comment: review.comment,
    createdAt: review.createdAt,
  };
}

@Injectable()
export class SubmitReviewUseCase implements ISubmitReviewUseCase {
  public constructor(
    @Inject(ITransactionReviewRepository)
    private readonly reviews: ITransactionReviewRepository,
    @Inject(IAwardGiftCompletionUseCase)
    private readonly awardGiftCompletion: IAwardGiftCompletionUseCase,
  ) {}

  public async handle(
    command: ISubmitReviewCommand,
  ): Promise<ISubmitReviewResult> {
    const context = await this.reviews.findReviewable(
      command.transactionId,
      command.userId,
    );

    // Người ngoài cuộc nhận cùng câu trả lời với lượt trao không tồn tại:
    // phân biệt hai cái là để lộ ai đang trao đổi với ai.
    if (!context || context.role === null)
      throw new GiftTransactionNotFoundException();

    if (!context.completed) throw new ReviewTransactionNotCompletedException();

    const isReceiver = context.role === TransactionReviewRoles.RECEIVER;
    const { accuracyPercent } = command.review;

    // Chỉ bên NHẬN chấm độ chính xác của mô tả. Database cũng chặn, nhưng chặn
    // ở đây cho ra thông báo đọc được thay vì một lỗi ràng buộc 500.
    if (isReceiver && accuracyPercent === undefined)
      throw new ValidationFailedException([
        'review.accuracyPercent: người nhận phải chấm mức chính xác của mô tả',
      ]);
    if (!isReceiver && accuracyPercent !== undefined)
      throw new ValidationFailedException([
        'review.accuracyPercent: chỉ người nhận mới chấm mục này',
      ]);

    const existing = await this.reviews.findByReviewer(
      command.transactionId,
      command.userId,
    );
    if (existing) throw new ReviewAlreadySubmittedException();

    const comment = command.review.comment?.trim();

    const { review } = await this.reviews.submitReview({
      globalId: randomUUID(),
      transactionId: command.transactionId,
      reviewerId: command.userId,
      revieweeId: isReceiver ? context.giverId : context.receiverId,
      reviewerRole: context.role,
      rating: command.review.rating,
      accuracyPercent: isReceiver ? (accuracyPercent as number) : null,
      comment: comment ? comment : null,
    });

    // Cộng điểm cho người tặng SAU khi đánh giá đã commit (F40). Chỉ đường của
    // người NHẬN mới sinh điểm: mức chính xác là thứ họ chấm, và đánh giá của
    // người tặng về người nhận không nói gì về chất lượng món quà.
    //
    // Khoá chống trùng theo lượt trao nên nếu job hết hạn chờ đã trả thưởng
    // trước đó, lần này không cộng thêm.
    if (isReceiver)
      await this.awardGiftCompletion.handle({
        transactionId: command.transactionId,
        giverId: context.giverId,
        accuracyPercent: accuracyPercent as number,
        source: 'REVIEW',
      });

    return { review: toDto(review) };
  }
}

@Injectable()
export class GetTransactionReviewsUseCase implements IGetTransactionReviewsUseCase {
  public constructor(
    @Inject(ITransactionReviewRepository)
    private readonly reviews: ITransactionReviewRepository,
  ) {}

  public async handle(
    command: IGetTransactionReviewsCommand,
  ): Promise<IGetTransactionReviewsResult> {
    const context = await this.reviews.findReviewable(
      command.transactionId,
      command.userId,
    );
    if (!context || context.role === null)
      throw new GiftTransactionNotFoundException();

    const mine = await this.reviews.findByReviewer(
      command.transactionId,
      command.userId,
    );

    // Chỉ thấy đánh giá của bên kia SAU khi đã gửi của mình. Đọc trước rồi mới
    // chấm là mời nhau trả đũa, và điểm số sẽ đo quan hệ chứ không đo trải
    // nghiệm.
    const counterpart = mine
      ? await this.reviews.findCounterpart(
          command.transactionId,
          command.userId,
        )
      : null;

    return {
      mine: mine ? toDto(mine) : null,
      counterpart: counterpart ? toDto(counterpart) : null,
    };
  }
}
