import {
  AllocationDistanceRules,
  DefaultAllocationPolicy,
  MaxAllocationSuggestions,
  allocationPolicyGaps,
  normalizeAllocationPolicy,
  resolveAllocationRadiusMeters,
} from './allocation';

describe('normalizeAllocationPolicy', () => {
  it('trả mặc định khi không phải object', () => {
    for (const raw of [null, undefined, 'x', 7, []]) {
      // Mảng cũng là object với `typeof`, nên phải đi qua nhánh đọc field và
      // ra đúng mặc định chứ không ra NaN.
      expect(normalizeAllocationPolicy(raw).maxSuggestions).toBe(20);
    }
  });

  it('mặc định trùng khít hành vi trước khi có chính sách', () => {
    // Đây là phép kiểm quan trọng nhất của cả file: nếu ai đổi một giá trị trong
    // `DefaultAllocationPolicy` thì bản deploy tiếp theo đổi gợi ý của người dùng
    // mà không ai publish gì. Ba con số dưới đây là `SmartMatchWeights`, và 20 là
    // `SmartMatchMaxResults`.
    expect(DefaultAllocationPolicy).toEqual({
      categoryMatchRequired: false,
      distanceRule: 'FILTER_ONLY',
      keywordMatchEnabled: true,
      autoCreateTransaction: false,
      maxSuggestions: 20,
      weights: { sameCategory: 0.5, keyword: 0.3, proximity: 0.2 },
    });
  });

  it('trọng số chia về tổng bằng 1, giữ nguyên tỉ lệ', () => {
    const { weights } = normalizeAllocationPolicy({
      weights: { sameCategory: 5, keyword: 3, proximity: 2 },
    });

    expect(weights.sameCategory).toBeCloseTo(0.5);
    expect(weights.keyword).toBeCloseTo(0.3);
    expect(weights.proximity).toBeCloseTo(0.2);
    expect(
      weights.sameCategory + weights.keyword + weights.proximity,
    ).toBeCloseTo(1);
  });

  it('tổng trọng số bằng 0 thì về mặc định, không ra NaN', () => {
    // Chia cho 0 ra NaN, và một NaN lọt vào `sort` làm thứ tự gợi ý thành ngẫu
    // nhiên tuỳ cách engine duyệt mảng — hỏng im lặng, không ném.
    const { weights } = normalizeAllocationPolicy({
      weights: { sameCategory: 0, keyword: 0, proximity: 0 },
    });

    expect(weights).toEqual(DefaultAllocationPolicy.weights);
    expect(Number.isNaN(weights.sameCategory)).toBe(false);
  });

  it('trọng số âm coi như 0', () => {
    const { weights } = normalizeAllocationPolicy({
      weights: { sameCategory: 1, keyword: -5, proximity: 1 },
    });

    expect(weights.keyword).toBe(0);
    expect(weights.sameCategory).toBeCloseTo(0.5);
  });

  it('maxSuggestions bị kẹp vào trần bằng rổ ứng viên', () => {
    expect(
      normalizeAllocationPolicy({ maxSuggestions: 5_000 }).maxSuggestions,
    ).toBe(MaxAllocationSuggestions);
    expect(
      normalizeAllocationPolicy({ maxSuggestions: 0 }).maxSuggestions,
    ).toBe(1);
    expect(
      normalizeAllocationPolicy({ maxSuggestions: 'x' }).maxSuggestions,
    ).toBe(20);
  });

  it('distanceRule lạ lùi về FILTER_ONLY', () => {
    expect(
      normalizeAllocationPolicy({ distanceRule: 'NEAREST' }).distanceRule,
    ).toBe('FILTER_ONLY');
    for (const rule of AllocationDistanceRules) {
      expect(
        normalizeAllocationPolicy({ distanceRule: rule }).distanceRule,
      ).toBe(rule);
    }
  });

  it('keywordMatchEnabled thiếu khoá thì BẬT, khác ba cờ còn lại', () => {
    // Cố ý không đối xứng: tắt từ khoá là thu hẹp thứ người dùng đang thấy, nên
    // dữ liệu cấu hình đọc không ra không được tự ý cắt.
    expect(normalizeAllocationPolicy({}).keywordMatchEnabled).toBe(true);
    expect(
      normalizeAllocationPolicy({ keywordMatchEnabled: false })
        .keywordMatchEnabled,
    ).toBe(false);
    expect(normalizeAllocationPolicy({}).categoryMatchRequired).toBe(false);
    expect(normalizeAllocationPolicy({}).autoCreateTransaction).toBe(false);
  });
});

describe('allocationPolicyGaps', () => {
  it('chính sách mặc định dùng được', () => {
    expect(allocationPolicyGaps(DefaultAllocationPolicy)).toEqual([]);
  });

  it('chặn tắt cả danh mục lẫn từ khoá', () => {
    const gaps = allocationPolicyGaps({
      ...DefaultAllocationPolicy,
      categoryMatchRequired: false,
      keywordMatchEnabled: false,
    });

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('không được tắt cùng lúc');
  });

  it('bắt buộc danh mục thì tắt từ khoá là hợp lệ', () => {
    expect(
      allocationPolicyGaps({
        ...DefaultAllocationPolicy,
        categoryMatchRequired: true,
        keywordMatchEnabled: false,
      }),
    ).toEqual([]);
  });

  it('từ chối autoCreateTransaction vì chưa hiện thực', () => {
    // Phép kiểm này phải ĐỔI cùng ngày với lượt hiện thực cờ đó. Để nguyên mà
    // hiện thực xong là chặn một tính năng đã làm; xoá mà chưa hiện thực là mở
    // một cờ không ai đọc.
    const gaps = allocationPolicyGaps({
      ...DefaultAllocationPolicy,
      autoCreateTransaction: true,
    });

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('chưa hiện thực');
  });
});

describe('resolveAllocationRadiusMeters', () => {
  it('FILTER_ONLY bỏ qua hạn mức hạng', () => {
    expect(
      resolveAllocationRadiusMeters('FILTER_ONLY', {
        filterRadiusMeters: 5_000,
        rankRadiusMeters: 30_000,
      }),
    ).toBe(5_000);
  });

  it('RANK_ONLY bỏ qua bộ lọc client', () => {
    expect(
      resolveAllocationRadiusMeters('RANK_ONLY', {
        filterRadiusMeters: 5_000,
        rankRadiusMeters: 30_000,
      }),
    ).toBe(30_000);
  });

  it('RANK_ONLY thiếu hạn mức hạng thì lùi về bộ lọc, không trả 0', () => {
    // Trả 0 là không gợi ý gì cho ai cho tới khi Admin seed xong capability —
    // chết tính năng mà không báo lỗi.
    for (const rank of [null, undefined, 0, -1, Number.NaN]) {
      expect(
        resolveAllocationRadiusMeters('RANK_ONLY', {
          filterRadiusMeters: 5_000,
          rankRadiusMeters: rank,
        }),
      ).toBe(5_000);
    }
  });

  it('RANK_OR_FILTER lấy cái nới hơn, cả hai chiều', () => {
    expect(
      resolveAllocationRadiusMeters('RANK_OR_FILTER', {
        filterRadiusMeters: 5_000,
        rankRadiusMeters: 30_000,
      }),
    ).toBe(30_000);
    expect(
      resolveAllocationRadiusMeters('RANK_OR_FILTER', {
        filterRadiusMeters: 40_000,
        rankRadiusMeters: 30_000,
      }),
    ).toBe(40_000);
    expect(
      resolveAllocationRadiusMeters('RANK_OR_FILTER', {
        filterRadiusMeters: 5_000,
        rankRadiusMeters: null,
      }),
    ).toBe(5_000);
  });
});
