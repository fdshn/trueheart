import {
  IAwardGiftCompletionUseCase,
  IEditReviewCommand,
  IEditReviewResult,
  IEditReviewUseCase,
  IGetTransactionReviewsCommand,
  IGetTransactionReviewsResult,
  IGetTransactionReviewsUseCase,
  ISubmitReviewCommand,
  ISubmitReviewResult,
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
  IAdminConfigRepository,
  IReviewableTransaction,
  ITransactionReviewRepository,
} from '@/domain/ports/repository';
import { isUniqueViolation } from '@/infrastructure/repository/unique-violation';
import { ITransactionReviewDto } from '@chantam.vn/chantam.core-lib/dto';
import { ITransactionReviewEntity } from '@chantam.vn/chantam.core-lib/entities';
import {
  normalizeReviewGraceConfig,
  ReviewGraceConfigKey,
  TransactionReviewRoles,
} from '@chantam.vn/chantam.core-lib/models';
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
    editedAt: review.editedAt,
  };
}

/**
 * Hạn sửa đánh giá: `completed_at + graceDays`. `null` khi chưa hoàn tất.
 *
 * Đúng mốc mà `findUnsettledValueBonuses` dùng để chốt thưởng, và điều đó là chủ
 * ý. Hai mốc lệch nhau sẽ tạo một khoảng mà đánh giá còn sửa được trong khi
 * thưởng đã trả theo nó — hoặc một khoảng không ai sửa được mà cũng chưa trả.
 */
function editableUntil(
  context: IReviewableTransaction,
  graceDays: number,
): Date | null {
  if (!context.completedAt) return null;

  const deadline = new Date(context.completedAt);
  deadline.setUTCDate(deadline.getUTCDate() + graceDays);
  return deadline;
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

    // Phép kiểm ở trên là để ra thông báo đọc được; ràng buộc
    // `UQ_transaction_reviews_one_per_reviewer` mới là thứ thật sự chặn. Hai
    // request song song cùng vượt qua phép kiểm rồi cùng ghi thì đúng một cái
    // thắng, và cái thua phải nhận cùng một lỗi nghiệp vụ chứ không phải một lỗi
    // ràng buộc 500 — cùng lối với `create-gift-request`.
    let review: ITransactionReviewEntity;
    try {
      ({ review } = await this.reviews.submitReview({
        globalId: randomUUID(),
        transactionId: command.transactionId,
        reviewerId: command.userId,
        revieweeId: isReceiver ? context.giverId : context.receiverId,
        reviewerRole: context.role,
        rating: command.review.rating,
        accuracyPercent: isReceiver ? (accuracyPercent as number) : null,
        comment: comment ? comment : null,
      }));
    } catch (error) {
      if (isUniqueViolation(error)) throw new ReviewAlreadySubmittedException();
      throw error;
    }

    // Trả NỐT điểm hoàn tất cho người tặng, SAU khi đánh giá đã commit (F40).
    //
    // Từ 07/10 (CHỐT-14) khoản này đã được cộng lúc lượt trao chuyển `COMPLETED`,
    // nên lượt gọi dưới đây gần như luôn là không-làm-gì: khoá chống trùng theo
    // lượt trao đã bị chiếm. Nó vẫn phải ở đây cho một ca đo được — người tặng
    // chạm `daily_cap = 10` lúc hoàn tất thì bút toán KHÔNG được ghi, và đây là
    // đường trả sớm nhất, không phải chờ tới job đêm. Cùng lý do đó, nó cũng trả
    // nốt cho những lượt đã `COMPLETED` trước 07/10.
    //
    // Chỉ đường của người NHẬN mới gọi: trước CHỐT-14 vì mức chính xác là thứ họ
    // chấm, và nay vẫn vậy vì `accuracyPercent` đi vào `reason` của bút toán —
    // đánh giá của người tặng về người nhận không nói gì về chất lượng món quà.
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

/**
 * Sửa đánh giá của chính mình, ĐÚNG một lần, trước hạn (CHỐT-10 mục 4).
 *
 * ## Ba cánh cửa, và cánh thứ ba ở database
 *
 * 1. **Đã gửi chưa** — không có gì để sửa thì `ReviewNotFoundException`, một mã
 *    riêng chứ không phải "không tìm thấy lượt trao": hai câu dẫn người dùng đi
 *    hai hướng khác nhau (một là gửi mới, một là không làm gì được).
 * 2. **Còn hạn không** — `completed_at + review.grace.graceDays`. Cùng mốc mà job
 *    chốt `value_bonus` dùng; lệch nhau là tạo một khoảng trả thưởng theo một con
 *    số rồi mới cho đổi nó.
 * 3. **Đã sửa chưa** — kiểm ở đây để ra thông báo đọc được, nhưng chốt thật là
 *    trigger `TRG_transaction_reviews_edit_once` cộng điều kiện
 *    `edited_at IS NULL` trong câu `UPDATE`. Hai request sửa song song đều đọc
 *    `editedAt === null` rồi cùng ghi; chỉ database thấy được cái thứ hai.
 *
 * ## Không gọi lại `AwardGiftCompletionUseCase`
 *
 * Trước CHỐT-14 mức chính xác là HỆ SỐ của điểm hoàn tất, nên sửa đánh giá sẽ phải
 * tính lại một bút toán đã ghi — và sổ chỉ ghi thêm. CHỐT-14 tách đôi: điểm hoàn
 * tất là khoản phẳng trả tại `COMPLETED`, còn phần theo mức chính xác là
 * `value_bonus` chốt TẠI HẠN. Nên bản sửa chảy vào thưởng qua đúng một đường —
 * `findUnsettledValueBonuses` đọc hàng đánh giá lúc hết hạn, và hàng đó đã là bản
 * cuối.
 *
 * Đó cũng là lý do hạn sửa và hạn chốt phải là MỘT con số, không phải hai.
 */
@Injectable()
export class EditReviewUseCase implements IEditReviewUseCase {
  public constructor(
    @Inject(ITransactionReviewRepository)
    private readonly reviews: ITransactionReviewRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async handle(command: IEditReviewCommand): Promise<IEditReviewResult> {
    const [context, rawGrace] = await Promise.all([
      this.reviews.findReviewable(command.transactionId, command.userId),
      this.adminConfig.getConfigValue(ReviewGraceConfigKey),
    ]);

    // Người ngoài cuộc nhận cùng câu trả lời với lượt trao không tồn tại.
    if (!context || context.role === null)
      throw new GiftTransactionNotFoundException();

    if (!context.completed) throw new ReviewTransactionNotCompletedException();

    const isReceiver = context.role === TransactionReviewRoles.RECEIVER;
    const { accuracyPercent } = command.review;

    // Cùng luật vai như đường gửi: chỉ bên NHẬN chấm mức chính xác. Nới ở đường
    // sửa sẽ cho bên TẶNG tự chấm mô tả của chính mình bằng một lượt sửa.
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
    if (!existing) throw new ReviewNotFoundException();
    if (existing.editedAt !== null) throw new ReviewAlreadyEditedException();

    const grace = normalizeReviewGraceConfig(rawGrace);
    const deadline = editableUntil(context, grace.graceDays);
    // `>=` chứ không `>`: job chốt thưởng lấy những lượt có
    // `completed_at <= now() - N days`, nên đúng mốc đó thưởng đã thuộc về job.
    // Để cả hai nhận mốc ấy là mở lại đúng khoảng chồng lấn mà con số N dùng chung
    // được đặt ra để tránh.
    if (!deadline || Date.now() >= deadline.getTime())
      throw new ReviewEditWindowClosedException(grace.graceDays);

    const comment = command.review.comment?.trim();
    const { review } = await this.reviews.editReview({
      transactionId: command.transactionId,
      reviewerId: command.userId,
      rating: command.review.rating,
      accuracyPercent: isReceiver ? (accuracyPercent as number) : null,
      comment: comment ? comment : null,
    });

    return { review: toDto(review) };
  }
}

@Injectable()
export class GetTransactionReviewsUseCase implements IGetTransactionReviewsUseCase {
  public constructor(
    @Inject(ITransactionReviewRepository)
    private readonly reviews: ITransactionReviewRepository,
    @Inject(IAdminConfigRepository)
    private readonly adminConfig: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IGetTransactionReviewsCommand,
  ): Promise<IGetTransactionReviewsResult> {
    const [context, rawGrace] = await Promise.all([
      this.reviews.findReviewable(command.transactionId, command.userId),
      // Hạn sửa trả kèm chứ không để client tự tính: `N` là cấu hình động, và một
      // bản sao con số đó trong client là một bản sao sẽ trôi khi Admin đổi.
      this.adminConfig.getConfigValue(ReviewGraceConfigKey),
    ]);
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

    // NHƯNG mức chính xác thì người TẶNG được thấy ngay, kể cả khi chưa đánh giá.
    //
    // Con số đó không phải một ý kiến về họ mà là **hệ số tính tiền**: thưởng của
    // người tặng bằng 56 × mức chính xác. Che nó đi nghĩa là họ thấy 24 điểm rơi
    // vào sổ mà không bao giờ biết con số 43% nào tạo ra, và muốn biết thì phải đi
    // chấm điểm người khác trước — một điều kiện không ai giải thích được.
    //
    // Việc che cũng đã là một lớp bảo vệ HÌNH THỨC: `reason` của bút toán trong
    // `GET /points/me/ledger` ghi thẳng "người nhận chấm 43% mức chính xác". Nên
    // giữ nguyên chỉ khiến hai endpoint nói khác nhau về cùng một con số.
    //
    // Bình luận và điểm sao vẫn kín — đó mới là chỗ trả đũa được.
    const disclosedAccuracy =
      counterpart === null && context.role === TransactionReviewRoles.GIVER
        ? await this.reviews.findCounterpartAccuracy(
            command.transactionId,
            command.userId,
          )
        : null;

    return {
      mine: mine ? toDto(mine) : null,
      counterpart: counterpart ? toDto(counterpart) : null,
      counterpartAccuracyPercent:
        counterpart?.accuracyPercent ?? disclosedAccuracy,
      // Trả cả khi chưa gửi đánh giá: đó là mốc người dùng cần biết TRƯỚC, để
      // quyết có chấm bây giờ hay chờ xem hàng dùng thêm vài ngày.
      myEditableUntil: editableUntil(
        context,
        normalizeReviewGraceConfig(rawGrace).graceDays,
      ),
    };
  }
}
