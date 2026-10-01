import { ListReferralReviewUseCase } from './list-referral-review.use-case';

const Candidate = {
  referrerUserId: '10000000-0000-4000-8000-000000000001',
  username: 'nguoi-moi',
  qualifiedReferrals: 7,
  signals: {
    sharedIpClusters: 2,
    sharedDeviceClusters: 1,
    largestClusterSize: 4,
  },
};

function setup(values: Record<string, unknown>) {
  const referrals = {
    findReferrersForReview: jest.fn(async () => ({
      entries: [Candidate],
      total: 1,
    })),
  };
  const adminConfig = {
    getConfigValue: jest.fn(async (key: string) => values[key]),
  };

  return {
    referrals,
    adminConfig,
    useCase: new ListReferralReviewUseCase(
      referrals as never,
      adminConfig as never,
    ),
  };
}

describe('ListReferralReviewUseCase', () => {
  it('chưa cấu hình thì TẮT, và nói rõ là tắt chứ không im lặng trả rỗng', async () => {
    // Một mảng rỗng vì CHƯA BẬT khác hẳn một mảng rỗng vì không có ai đáng xem, mà
    // mảng rỗng không tự phân biệt được hai câu đó.
    const { useCase } = setup({});
    const result = await useCase.handle({ page: 1, pageSize: 20 });

    expect(result.threshold.enabled).toBe(false);
    expect(result.threshold.minDeviceClusters).toBe(0);
    expect(result.threshold.minClusterSize).toBe(0);
  });

  it('trả kèm ngưỡng đang áp để Admin biết danh sách dựa trên đâu', async () => {
    const { useCase } = setup({
      'referral.review_min_qualified': 5,
      'referral.review_min_device_clusters': 2,
      'referral.review_min_cluster_size': 4,
    });
    const result = await useCase.handle({ page: 1, pageSize: 20 });

    expect(result.threshold).toEqual({
      enabled: true,
      minQualifiedReferrals: 5,
      minDeviceClusters: 2,
      minClusterSize: 4,
    });
  });

  it('truyền đúng ngưỡng đã chuẩn hoá xuống repository, không truyền giá trị thô', async () => {
    // Giá trị thô có thể là số lẻ hoặc chuỗi; repository dựng câu SQL từ nó nên nó
    // phải đã qua `normalizeReferralAbuseConfig`.
    const { useCase, referrals } = setup({
      'referral.review_min_qualified': 5.9,
      'referral.review_min_device_clusters': 2.7,
      'referral.review_min_cluster_size': 1,
    });
    await useCase.handle({ page: 2, pageSize: 10 });

    expect(referrals.findReferrersForReview).toHaveBeenCalledWith({
      config: {
        minQualifiedReferrals: 5,
        minDeviceClusters: 2,
        // Một cụm có từ 2 người nên 1 bị kẹp lên 2.
        minClusterSize: 2,
      },
      limit: 10,
      offset: 10,
    });
  });

  it('trả ứng viên kèm cả ba tín hiệu tách nhau', async () => {
    const { useCase } = setup({
      'referral.review_min_qualified': 5,
      'referral.review_min_device_clusters': 1,
      'referral.review_min_cluster_size': 0,
    });
    const result = await useCase.handle({ page: 1, pageSize: 20 });

    expect(result.candidates[0].signals).toEqual({
      sharedIpClusters: 2,
      sharedDeviceClusters: 1,
      largestClusterSize: 4,
    });
    expect(result.total).toBe(1);
  });
});
