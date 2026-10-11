import {
  GiftTransactionNotFoundException,
  ReviewAlreadyEditedException,
  ReviewAlreadySubmittedException,
  ReviewEditWindowClosedException,
  ReviewNotFoundException,
  ReviewTransactionNotCompletedException,
} from '@/domain/exceptions';
import { ITransactionReviewRepository } from '@/domain/ports/repository';
import { TransactionReviewRoles } from '@chantam.vn/chantam.core-lib/models';
import { ValidationFailedException } from '@chantam/service.common-lib/exception';
import {
  EditReviewUseCase,
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
      // Hoàn tất hôm qua: còn trong hạn sửa 7 ngày mặc định.
      completedAt: new Date(Date.now() - 24 * 3600 * 1000),
    }),
    findByReviewer: jest.fn().mockResolvedValue(null),
    editReview: jest.fn().mockResolvedValue({
      review: {
        globalId: 'r1',
        transactionId: TransactionId,
        reviewerId: ReceiverId,
        revieweeId: GiverId,
        reviewerRole: TransactionReviewRoles.RECEIVER,
        rating: 2,
        accuracyPercent: 40,
        comment: 'Nhìn lại thì mô tả lệch nhiều',
        createdAt: new Date(),
        editedAt: new Date(),
      },
      accuracy: { percent: 40, samples: 1, reviewRequired: true },
      rating: {
        asGiver: { average: 2, samples: 1 },
        asReceiver: { average: null, samples: 0 },
      },
    }),
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

/** Cấu hình hạn chờ đánh giá; `null` để thử nhánh rơi về mặc định (7 ngày). */
function makeConfig(graceDays: number | null = 7) {
  return {
    getConfigValue: jest
      .fn()
      .mockResolvedValue(
        graceDays === null ? null : { graceDays, defaultAccuracyPercent: 80 },
      ),
  } as never;
}

/**
 * Đường cộng điểm giả. Ca "cộng đúng bao nhiêu điểm" nằm ở
 * `award-gift-completion.use-case.spec.ts`; ở đây chỉ cần nó tồn tại.
 */
function makeAward() {
  return {
    handle: jest.fn().mockResolvedValue({
      awarded: true,
      points: 50,
      appliedPercent: 90,
      usedDefault: false,
    }),
  } as never;
}

describe('SubmitReviewUseCase', () => {
  it('bên NHẬN gửi được, và người được đánh giá là bên TẶNG', async () => {
    const reviews = makeReviews();

    await new SubmitReviewUseCase(reviews, makeAward()).handle({
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

    await new SubmitReviewUseCase(reviews, makeAward()).handle({
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
      new SubmitReviewUseCase(reviews, makeAward()).handle({
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
      new SubmitReviewUseCase(reviews, makeAward()).handle({
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
      new SubmitReviewUseCase(reviews, makeAward()).handle({
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
      new SubmitReviewUseCase(reviews, makeAward()).handle({
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
      new SubmitReviewUseCase(outsider, makeAward()).handle({
        userId: OutsiderId,
        transactionId: TransactionId,
        review: body,
      }),
    ).rejects.toBeInstanceOf(GiftTransactionNotFoundException);
    await expect(
      new SubmitReviewUseCase(missing, makeAward()).handle({
        userId: OutsiderId,
        transactionId: TransactionId,
        review: body,
      }),
    ).rejects.toBeInstanceOf(GiftTransactionNotFoundException);
  });

  it('nhận xét chỉ có khoảng trắng thì lưu null', async () => {
    const reviews = makeReviews();

    await new SubmitReviewUseCase(reviews, makeAward()).handle({
      userId: ReceiverId,
      transactionId: TransactionId,
      review: { rating: 5, accuracyPercent: 90, comment: '   ' },
    });

    expect(reviews.submitReview).toHaveBeenCalledWith(
      expect.objectContaining({ comment: null }),
    );
  });
});

/** Đánh giá đã gửi, chưa sửa lần nào. */
function mySubmitted(overrides: Record<string, unknown> = {}) {
  return {
    globalId: 'r1',
    transactionId: TransactionId,
    reviewerId: ReceiverId,
    revieweeId: GiverId,
    reviewerRole: TransactionReviewRoles.RECEIVER,
    rating: 5,
    accuracyPercent: 90,
    comment: 'Hàng đúng mô tả',
    createdAt: new Date(),
    editedAt: null,
    ...overrides,
  };
}

function contextWith(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: TransactionId,
    giverId: GiverId,
    receiverId: ReceiverId,
    role: TransactionReviewRoles.RECEIVER,
    completed: true,
    completedAt: new Date(Date.now() - 24 * 3600 * 1000),
    ...overrides,
  };
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 3600 * 1000);
}

const editCommand = {
  userId: ReceiverId,
  transactionId: TransactionId,
  review: {
    rating: 2,
    accuracyPercent: 40,
    comment: 'Nhìn lại thì mô tả lệch nhiều',
  },
};

describe('EditReviewUseCase · sửa một lần (CHỐT-10 mục 4)', () => {
  it('sửa được khi còn hạn và chưa sửa lần nào', async () => {
    const reviews = makeReviews({
      findByReviewer: jest.fn().mockResolvedValue(mySubmitted()),
    });

    const result = await new EditReviewUseCase(reviews, makeConfig()).handle(
      editCommand,
    );

    expect(reviews.editReview).toHaveBeenCalledWith({
      transactionId: TransactionId,
      reviewerId: ReceiverId,
      rating: 2,
      accuracyPercent: 40,
      comment: 'Nhìn lại thì mô tả lệch nhiều',
    });
    expect(result.review.editedAt).not.toBeNull();
  });

  it('KHÔNG truyền bản cũ xuống repository', async () => {
    // Bản cũ do TRIGGER ở database chụp. Nơi gọi truyền bản cũ là nơi gọi có
    // thể truyền SAI bản cũ — đúng thứ bảng này được dựng để chống.
    const reviews = makeReviews({
      findByReviewer: jest.fn().mockResolvedValue(mySubmitted()),
    });

    await new EditReviewUseCase(reviews, makeConfig()).handle(editCommand);

    const params = (reviews.editReview as jest.Mock).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(Object.keys(params).sort()).toEqual([
      'accuracyPercent',
      'comment',
      'rating',
      'reviewerId',
      'transactionId',
    ]);
  });

  it('chưa gửi đánh giá nào thì KHÔNG phải lỗi "không tìm thấy lượt trao"', async () => {
    // Hai câu dẫn người dùng đi hai hướng khác nhau: một là gửi mới, một là
    // không làm gì được. Gộp chúng lại là để họ đoán.
    const reviews = makeReviews();

    await expect(
      new EditReviewUseCase(reviews, makeConfig()).handle(editCommand),
    ).rejects.toBeInstanceOf(ReviewNotFoundException);
    expect(reviews.editReview).not.toHaveBeenCalled();
  });

  it('đã sửa một lần thì khoá', async () => {
    const reviews = makeReviews({
      findByReviewer: jest
        .fn()
        .mockResolvedValue(mySubmitted({ editedAt: new Date() })),
    });

    await expect(
      new EditReviewUseCase(reviews, makeConfig()).handle(editCommand),
    ).rejects.toBeInstanceOf(ReviewAlreadyEditedException);
    expect(reviews.editReview).not.toHaveBeenCalled();
  });

  it('quá hạn thì khoá, dù chưa sửa lần nào', async () => {
    const reviews = makeReviews({
      findReviewable: jest
        .fn()
        .mockResolvedValue(contextWith({ completedAt: daysAgo(8) })),
      findByReviewer: jest.fn().mockResolvedValue(mySubmitted()),
    });

    await expect(
      new EditReviewUseCase(reviews, makeConfig()).handle(editCommand),
    ).rejects.toBeInstanceOf(ReviewEditWindowClosedException);
    expect(reviews.editReview).not.toHaveBeenCalled();
  });

  it('ĐÚNG mốc hạn thì đã khoá — mốc đó thuộc job chốt thưởng', async () => {
    // `findUnsettledValueBonuses` lấy `completed_at <= now() - N days`, nên tại
    // đúng mốc ấy thưởng đã được chốt theo bản đánh giá hiện có. Cho sửa lúc đó
    // là mở lại khoảng chồng lấn mà con số N dùng chung được đặt ra để tránh.
    const reviews = makeReviews({
      findReviewable: jest
        .fn()
        .mockResolvedValue(contextWith({ completedAt: daysAgo(7) })),
      findByReviewer: jest.fn().mockResolvedValue(mySubmitted()),
    });

    await expect(
      new EditReviewUseCase(reviews, makeConfig()).handle(editCommand),
    ).rejects.toBeInstanceOf(ReviewEditWindowClosedException);
  });

  it('hạn tính theo SỐ NGÀY Admin cấu hình, không phải hằng trong code', async () => {
    // Hoàn tất 10 ngày trước: quá hạn 7 ngày mặc định, nhưng còn hạn nếu Admin
    // đặt 30 — và đó là cùng con số mà job chốt thưởng đọc.
    const reviews = makeReviews({
      findReviewable: jest
        .fn()
        .mockResolvedValue(contextWith({ completedAt: daysAgo(10) })),
      findByReviewer: jest.fn().mockResolvedValue(mySubmitted()),
    });

    await new EditReviewUseCase(reviews, makeConfig(30)).handle(editCommand);

    expect(reviews.editReview).toHaveBeenCalled();
  });

  it('cấu hình hỏng thì rơi về 7 ngày, không ném', async () => {
    const reviews = makeReviews({
      findByReviewer: jest.fn().mockResolvedValue(mySubmitted()),
    });

    await new EditReviewUseCase(reviews, makeConfig(null)).handle(editCommand);

    expect(reviews.editReview).toHaveBeenCalled();
  });

  it('lượt trao CHƯA hoàn tất thì không có gì để sửa', async () => {
    const reviews = makeReviews({
      findReviewable: jest
        .fn()
        .mockResolvedValue(
          contextWith({ completed: false, completedAt: null }),
        ),
    });

    await expect(
      new EditReviewUseCase(reviews, makeConfig()).handle(editCommand),
    ).rejects.toBeInstanceOf(ReviewTransactionNotCompletedException);
  });

  it('người ngoài cuộc không sửa được', async () => {
    const reviews = makeReviews({
      findReviewable: jest.fn().mockResolvedValue(contextWith({ role: null })),
    });

    await expect(
      new EditReviewUseCase(reviews, makeConfig()).handle({
        ...editCommand,
        userId: OutsiderId,
      }),
    ).rejects.toBeInstanceOf(GiftTransactionNotFoundException);
  });

  it('bên TẶNG không được chấm mức chính xác bằng một lượt SỬA', async () => {
    // Luật vai phải giống đường gửi. Nới ở đây là cho người tặng tự chấm mô tả
    // của chính mình qua cửa sau.
    const reviews = makeReviews({
      findReviewable: jest
        .fn()
        .mockResolvedValue(contextWith({ role: TransactionReviewRoles.GIVER })),
      findByReviewer: jest.fn().mockResolvedValue(mySubmitted()),
    });

    await expect(
      new EditReviewUseCase(reviews, makeConfig()).handle(editCommand),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(reviews.editReview).not.toHaveBeenCalled();
  });

  it('bên NHẬN sửa mà bỏ mức chính xác thì bị chặn', async () => {
    const reviews = makeReviews({
      findByReviewer: jest.fn().mockResolvedValue(mySubmitted()),
    });

    await expect(
      new EditReviewUseCase(reviews, makeConfig()).handle({
        ...editCommand,
        review: { rating: 2, comment: 'Quên chấm mô tả' },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
  });

  it('bỏ trống bình luận là XOÁ bình luận, không phải giữ nguyên', async () => {
    // Một lượt sửa là một bản đánh giá ĐẦY ĐỦ. Hiểu "bỏ trống = giữ nguyên" thì
    // việc xoá bình luận không diễn đạt được, và client không có cách nói nó.
    const reviews = makeReviews({
      findByReviewer: jest.fn().mockResolvedValue(mySubmitted()),
    });

    await new EditReviewUseCase(reviews, makeConfig()).handle({
      ...editCommand,
      review: { rating: 2, accuracyPercent: 40 },
    });

    expect(reviews.editReview).toHaveBeenCalledWith(
      expect.objectContaining({ comment: null }),
    );
  });
});

describe('GetTransactionReviewsUseCase', () => {
  it('chưa gửi của mình thì KHÔNG thấy của bên kia', async () => {
    // Đọc trước rồi mới chấm là mời nhau trả đũa.
    const reviews = makeReviews();

    const result = await new GetTransactionReviewsUseCase(
      reviews,
      makeConfig(),
    ).handle({
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

    const result = await new GetTransactionReviewsUseCase(
      reviews,
      makeConfig(),
    ).handle({
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
      new GetTransactionReviewsUseCase(reviews, makeConfig()).handle({
        userId: OutsiderId,
        transactionId: TransactionId,
      }),
    ).rejects.toBeInstanceOf(GiftTransactionNotFoundException);
  });
});
