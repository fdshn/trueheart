import {
  GiftTransactionNotFoundException,
  ReviewAlreadySubmittedException,
  ReviewTransactionNotCompletedException,
} from '@/domain/exceptions';
import { ITransactionReviewRepository } from '@/domain/ports/repository';
import { TransactionReviewRoles } from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  GetTransactionReviewsUseCase,
  SubmitReviewUseCase,
} from './review.use-cases';

const TransactionId = '11111111-1111-4111-8111-111111111111';
const GiverId = '22222222-2222-4222-8222-222222222222';
const ReceiverId = '33333333-3333-4333-8333-333333333333';
const OutsiderId = '44444444-4444-4444-8444-444444444444';

function makeReviews(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    findReviewable: jest.fn().mockResolvedValue({
      transactionId: TransactionId,
      giverId: GiverId,
      receiverId: ReceiverId,
      role: TransactionReviewRoles.RECEIVER,
      completed: true,
    }),
    findByReviewer: jest.fn().mockResolvedValue(null),
    findCounterpart: jest.fn().mockResolvedValue(null),
    submitReview: jest.fn().mockResolvedValue({
      review: {
        globalId: 'r1',
        transactionId: TransactionId,
        reviewerId: ReceiverId,
        revieweeId: GiverId,
        reviewerRole: TransactionReviewRoles.RECEIVER,
        rating: 5,
        accuracyPercent: 90,
        comment: null,
        createdAt: new Date(),
      },
      accuracy: { percent: null, samples: 1, reviewRequired: false },
    }),
    getAccuracy: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<ITransactionReviewRepository>;
}

describe('SubmitReviewUseCase', () => {
  it('bên NHẬN gửi được, và người được đánh giá là bên TẶNG', async () => {
    const reviews = makeReviews();

    await new SubmitReviewUseCase(reviews).handle({
      userId: ReceiverId,
      transactionId: TransactionId,
      review: { rating: 5, accuracyPercent: 90 },
    });

    expect(reviews.submitReview).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewerId: ReceiverId,
        revieweeId: GiverId,
        reviewerRole: TransactionReviewRoles.RECEIVER,
        accuracyPercent: 90,
      }),
    );
  });

  it('bên TẶNG gửi được nhưng KHÔNG chấm accuracy', async () => {
    const reviews = makeReviews({
      findReviewable: jest.fn().mockResolvedValue({
        transactionId: TransactionId,
        giverId: GiverId,
        receiverId: ReceiverId,
        role: TransactionReviewRoles.GIVER,
        completed: true,
      }),
    });

    await new SubmitReviewUseCase(reviews).handle({
      userId: GiverId,
      transactionId: TransactionId,
      review: { rating: 4 },
    });

    expect(reviews.submitReview).toHaveBeenCalledWith(
      expect.objectContaining({
        revieweeId: ReceiverId,
        reviewerRole: TransactionReviewRoles.GIVER,
        accuracyPercent: null,
      }),
    );
  });

  it('bên NHẬN quên chấm accuracy thì bị từ chối', async () => {
    const reviews = makeReviews();

    await expect(
      new SubmitReviewUseCase(reviews).handle({
        userId: ReceiverId,
        transactionId: TransactionId,
        review: { rating: 5 },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(reviews.submitReview).not.toHaveBeenCalled();
  });

  it('bên TẶNG cố chấm accuracy thì bị từ chối', async () => {
    // Người tặng không ở vị trí đánh giá mô tả của chính mình.
    const reviews = makeReviews({
      findReviewable: jest.fn().mockResolvedValue({
        transactionId: TransactionId,
        giverId: GiverId,
        receiverId: ReceiverId,
        role: TransactionReviewRoles.GIVER,
        completed: true,
      }),
    });

    await expect(
      new SubmitReviewUseCase(reviews).handle({
        userId: GiverId,
        transactionId: TransactionId,
        review: { rating: 4, accuracyPercent: 100 },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(reviews.submitReview).not.toHaveBeenCalled();
  });

  it('lượt trao chưa hoàn tất thì chưa đánh giá được', async () => {
    const reviews = makeReviews({
      findReviewable: jest.fn().mockResolvedValue({
        transactionId: TransactionId,
        giverId: GiverId,
        receiverId: ReceiverId,
        role: TransactionReviewRoles.RECEIVER,
        completed: false,
      }),
    });

    await expect(
      new SubmitReviewUseCase(reviews).handle({
        userId: ReceiverId,
        transactionId: TransactionId,
        review: { rating: 5, accuracyPercent: 90 },
      }),
    ).rejects.toBeInstanceOf(ReviewTransactionNotCompletedException);
  });

  it('đánh giá lần hai bị chặn', async () => {
    const reviews = makeReviews({
      findByReviewer: jest.fn().mockResolvedValue({ globalId: 'r0' }),
    });

    await expect(
      new SubmitReviewUseCase(reviews).handle({
        userId: ReceiverId,
        transactionId: TransactionId,
        review: { rating: 5, accuracyPercent: 90 },
      }),
    ).rejects.toBeInstanceOf(ReviewAlreadySubmittedException);
    expect(reviews.submitReview).not.toHaveBeenCalled();
  });

  it('người ngoài cuộc nhận CÙNG câu trả lời với lượt trao không tồn tại', async () => {
    // Phân biệt hai cái là để lộ ai đang trao đổi với ai.
    const outsider = makeReviews({
      findReviewable: jest.fn().mockResolvedValue({
        transactionId: TransactionId,
        giverId: GiverId,
        receiverId: ReceiverId,
        role: null,
        completed: true,
      }),
    });
    const missing = makeReviews({
      findReviewable: jest.fn().mockResolvedValue(null),
    });

    const body = { rating: 5, accuracyPercent: 90 };
    await expect(
      new SubmitReviewUseCase(outsider).handle({
        userId: OutsiderId,
        transactionId: TransactionId,
        review: body,
      }),
    ).rejects.toBeInstanceOf(GiftTransactionNotFoundException);
    await expect(
      new SubmitReviewUseCase(missing).handle({
        userId: OutsiderId,
        transactionId: TransactionId,
        review: body,
      }),
    ).rejects.toBeInstanceOf(GiftTransactionNotFoundException);
  });

  it('nhận xét chỉ có khoảng trắng thì lưu null', async () => {
    const reviews = makeReviews();

    await new SubmitReviewUseCase(reviews).handle({
      userId: ReceiverId,
      transactionId: TransactionId,
      review: { rating: 5, accuracyPercent: 90, comment: '   ' },
    });

    expect(reviews.submitReview).toHaveBeenCalledWith(
      expect.objectContaining({ comment: null }),
    );
  });
});

describe('GetTransactionReviewsUseCase', () => {
  it('chưa gửi của mình thì KHÔNG thấy của bên kia', async () => {
    // Đọc trước rồi mới chấm là mời nhau trả đũa.
    const reviews = makeReviews();

    const result = await new GetTransactionReviewsUseCase(reviews).handle({
      userId: ReceiverId,
      transactionId: TransactionId,
    });

    expect(result.mine).toBeNull();
    expect(result.counterpart).toBeNull();
    expect(reviews.findCounterpart).not.toHaveBeenCalled();
  });

  it('gửi rồi thì thấy cả hai', async () => {
    const mine = {
      globalId: 'r1',
      transactionId: TransactionId,
      reviewerId: ReceiverId,
      revieweeId: GiverId,
      reviewerRole: TransactionReviewRoles.RECEIVER,
      rating: 5,
      accuracyPercent: 90,
      comment: null,
      createdAt: new Date(),
    };
    const reviews = makeReviews({
      findByReviewer: jest.fn().mockResolvedValue(mine),
      findCounterpart: jest
        .fn()
        .mockResolvedValue({ ...mine, globalId: 'r2', reviewerId: GiverId }),
    });

    const result = await new GetTransactionReviewsUseCase(reviews).handle({
      userId: ReceiverId,
      transactionId: TransactionId,
    });

    expect(result.mine?.reviewId).toBe('r1');
    expect(result.counterpart?.reviewId).toBe('r2');
  });

  it('người ngoài cuộc không đọc được', async () => {
    const reviews = makeReviews({
      findReviewable: jest.fn().mockResolvedValue({
        transactionId: TransactionId,
        giverId: GiverId,
        receiverId: ReceiverId,
        role: null,
        completed: true,
      }),
    });

    await expect(
      new GetTransactionReviewsUseCase(reviews).handle({
        userId: OutsiderId,
        transactionId: TransactionId,
      }),
    ).rejects.toBeInstanceOf(GiftTransactionNotFoundException);
  });
});
