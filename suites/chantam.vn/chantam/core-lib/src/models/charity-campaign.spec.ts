import {
  CharityReviewRatingMax,
  CharityReviewRatingMin,
  MaxCharityTargetItems,
  canCancelCharityParticipation,
  canReviewCharityCampaign,
  charityCampaignGaps,
  charityProgressPercent,
  charityReviewRoleOf,
  isCharityReviewRating,
  isCharityUrl,
  normalizeCharitySlug,
  slugifyCharityTitle,
} from './charity-campaign';

const Hour = 3_600_000;

function validInput(overrides: Record<string, unknown> = {}) {
  const startTime = new Date('2026-08-20T01:00:00.000Z');
  return {
    title: 'Bếp cơm Vu Lan',
    slug: 'bep-com-vu-lan',
    description: 'Nấu và trao 500 suất cơm chay.',
    bannerUrl: 'https://cdn.chantam.vn/a.jpg',
    badgeName: 'Tấm lòng Vu Lan',
    startTime,
    endTime: new Date(startTime.getTime() + 8 * Hour),
    targetItemsCount: 500,
    ...overrides,
  } as Parameters<typeof charityCampaignGaps>[0];
}

describe('slugifyCharityTitle', () => {
  it('bỏ dấu tiếng Việt và xử lý đúng chữ đ', () => {
    // `đ` là một chữ RIÊNG trong Unicode, không phải `d` cộng dấu, nên `normalize('NFD')`
    // không tách được nó. Thiếu bước đổi `đ` trước NFD thì "Đồ dùng" ra "o-dung".
    expect(slugifyCharityTitle('Đồ Dùng Cho Bé 2026')).toBe(
      'do-dung-cho-be-2026',
    );
  });

  it('cắt theo trần 200 ký tự của cột campaigns.slug', () => {
    // Cột `campaigns.slug` là `varchar(200)`, hẹp hơn `blogs.slug`. Dùng lại thuật toán
    // của Blog nhưng KHÔNG được dùng lại trần của Blog.
    expect(slugifyCharityTitle('a'.repeat(400))).toHaveLength(200);
  });

  it('tiêu đề toàn ký tự lạ ra slug RỖNG để bên gọi tự xử', () => {
    // Trả chuỗi rỗng chứ không bịa hậu tố: cột `UNIQUE NOT NULL`, nên bên gọi phải thấy
    // và đổi thành một thông báo đọc được.
    expect(slugifyCharityTitle('🙏🙏🙏')).toBe('');
  });
});

describe('normalizeCharitySlug', () => {
  it('chuẩn hoá slug gõ tay y hệt slug sinh tự động', () => {
    expect(normalizeCharitySlug('Bếp Cơm  Vu Lan!!')).toBe('bep-com-vu-lan');
  });

  it('kiểu không phải chuỗi ra rỗng chứ không ném', () => {
    expect(normalizeCharitySlug(undefined)).toBe('');
    expect(normalizeCharitySlug(42)).toBe('');
  });
});

describe('isCharityUrl', () => {
  it('chỉ nhận https', () => {
    expect(isCharityUrl('https://cdn.chantam.vn/a.jpg')).toBe(true);
    expect(isCharityUrl('http://cdn.chantam.vn/a.jpg')).toBe(false);
    expect(isCharityUrl('javascript:alert(1)')).toBe(false);
    expect(isCharityUrl(null)).toBe(false);
  });
});

describe('charityCampaignGaps', () => {
  it('hồ sơ đủ thông tin không có khoảng trống nào', () => {
    expect(charityCampaignGaps(validInput())).toEqual([]);
  });

  it('endTime không sau startTime là một khoảng trống', () => {
    const startTime = new Date('2026-08-20T01:00:00.000Z');
    expect(
      charityCampaignGaps(validInput({ startTime, endTime: startTime })),
    ).toContain('endTime phải sau startTime');
  });

  it('startTime không hợp lệ không làm hàm ném', () => {
    // `new Date('khong-phai-ngay')` ra `Invalid Date`, và `.getTime()` ra `NaN`. Nếu hàm
    // này so sánh thẳng thì `NaN <= NaN` là `false` và một mốc rác ĐI QUA được.
    const gaps = charityCampaignGaps(
      validInput({ startTime: new Date('khong-phai-ngay') }),
    );
    expect(gaps).toContain('startTime không phải thời điểm hợp lệ');
  });

  it('slug rỗng được nói rõ cách sửa', () => {
    expect(charityCampaignGaps(validInput({ slug: '' }))[0]).toContain(
      'hoặc gửi slug riêng',
    );
  });

  it('badgeName rỗng hoặc chỉ dấu cách bị bắt', () => {
    expect(charityCampaignGaps(validInput({ badgeName: '   ' }))).toContain(
      'badgeName không được rỗng — nó là huy hiệu người tham gia nhận được',
    );
  });

  it('bannerUrl không https bị bắt', () => {
    expect(
      charityCampaignGaps(validInput({ bannerUrl: 'http://x.vn/a.jpg' })),
    ).toContain('bannerUrl phải là một đường dẫn https');
  });

  it('targetItemsCount âm, lẻ, hoặc vượt trần đều bị bắt', () => {
    for (const bad of [-1, 1.5, MaxCharityTargetItems + 1]) {
      expect(
        charityCampaignGaps(validInput({ targetItemsCount: bad })),
      ).toContain(
        `targetItemsCount phải là số nguyên từ 0 tới ${MaxCharityTargetItems}`,
      );
    }
  });

  it('targetItemsCount = 0 là HỢP LỆ — nghĩa là không đặt mục tiêu', () => {
    expect(charityCampaignGaps(validInput({ targetItemsCount: 0 }))).toEqual(
      [],
    );
  });
});

describe('canCancelCharityParticipation', () => {
  const startTime = new Date('2026-08-20T01:00:00.000Z');

  it('cho huỷ khi chưa tới giờ bắt đầu', () => {
    expect(
      canCancelCharityParticipation({
        startTime,
        now: new Date(startTime.getTime() - 1),
      }),
    ).toBe(true);
  });

  it('chặn huỷ ĐÚNG tại giây bắt đầu', () => {
    // Biên là `<`, không phải `<=`: đúng lúc khai mạc thì danh sách đã chốt.
    expect(canCancelCharityParticipation({ startTime, now: startTime })).toBe(
      false,
    );
  });
});

describe('canReviewCharityCampaign', () => {
  const endTime = new Date('2026-08-20T09:00:00.000Z');

  it('chặn đánh giá trước khi kết thúc', () => {
    expect(
      canReviewCharityCampaign({
        endTime,
        now: new Date(endTime.getTime() - 1),
      }),
    ).toBe(false);
  });

  it('mở ĐÚNG tại giây kết thúc', () => {
    // Biên là `>=`: hoạt động vừa xong là đã có gì để đánh giá.
    expect(canReviewCharityCampaign({ endTime, now: endTime })).toBe(true);
  });
});

describe('charityReviewRoleOf', () => {
  const organizerId = 'organizer';
  const participantIds = ['p1', 'p2'];

  it('người tạo là ORGANIZER', () => {
    expect(
      charityReviewRoleOf({
        organizerId,
        participantIds,
        actorId: organizerId,
      }),
    ).toBe('ORGANIZER');
  });

  it('người đã đăng ký là PARTICIPANT', () => {
    expect(
      charityReviewRoleOf({ organizerId, participantIds, actorId: 'p2' }),
    ).toBe('PARTICIPANT');
  });

  it('người ngoài cuộc ra null, KHÔNG ra một vai mặc định', () => {
    // `null` chứ không phải `'PARTICIPANT'`: một người ngoài cuộc viết đánh giá được là
    // cho phép chấm điểm một hoạt động mình không dự.
    expect(
      charityReviewRoleOf({ organizerId, participantIds, actorId: 'nguoila' }),
    ).toBeNull();
  });

  it('hoạt động mất người tạo (createdBy null) thì không ai là ORGANIZER', () => {
    // `created_by` là `ON DELETE SET NULL`, nên ca này xảy ra thật khi người tạo xoá
    // tài khoản. `null === null` phải KHÔNG biến một actor null thành người tổ chức —
    // nhưng actorId luôn là chuỗi, nên điều cần canh là người khác không lọt vào vai đó.
    expect(
      charityReviewRoleOf({
        organizerId: null,
        participantIds,
        actorId: 'nguoila',
      }),
    ).toBeNull();
  });
});

describe('isCharityReviewRating', () => {
  it('nhận đúng 1..5 nguyên', () => {
    for (
      let value = CharityReviewRatingMin;
      value <= CharityReviewRatingMax;
      value += 1
    )
      expect(isCharityReviewRating(value)).toBe(true);
  });

  it('từ chối 0, 6, số lẻ và chuỗi', () => {
    for (const bad of [0, 6, 4.5, '5', null, undefined])
      expect(isCharityReviewRating(bad)).toBe(false);
  });
});

describe('charityProgressPercent', () => {
  it('không đặt mục tiêu ra null, KHÔNG ra 0', () => {
    // Hiện "0%" cho một hoạt động không đặt mục tiêu là nói sai.
    expect(
      charityProgressPercent({ currentItemsCount: 0, targetItemsCount: 0 }),
    ).toBeNull();
  });

  it('làm tròn về số nguyên', () => {
    expect(
      charityProgressPercent({ currentItemsCount: 1, targetItemsCount: 3 }),
    ).toBe(33);
  });

  it('KHÔNG kẹp trần 100 — khai vượt mục tiêu là chuyện tốt', () => {
    expect(
      charityProgressPercent({ currentItemsCount: 600, targetItemsCount: 500 }),
    ).toBe(120);
  });
});
