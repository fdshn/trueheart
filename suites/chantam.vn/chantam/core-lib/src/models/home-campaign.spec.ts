import {
  DefaultHomeLayout,
  HomeSectionTypes,
  MaxHomeBanners,
  homeCampaignGaps,
  isHomeColor,
  isHomeDeepLink,
  isHomeImageUrl,
  normalizeHomeBanners,
  normalizeHomeFloatingBanner,
  normalizeHomePopup,
  normalizeHomeSections,
  normalizeHomeTheme,
} from './home-campaign';

describe('DefaultHomeLayout', () => {
  it('là bố cục THẬT, không phải rỗng — BR_CAMP_02', () => {
    // Giữa hai chiến dịch là phần lớn thời gian của năm. Trả rỗng ở đây nghĩa là
    // app không có gì vẽ trong phần lớn thời gian đó.
    expect(DefaultHomeLayout.sectionsLayout.length).toBeGreaterThan(0);
    expect(
      DefaultHomeLayout.sectionsLayout.some((section) => section.enabled),
    ).toBe(true);
  });

  it('campaignId là null để client phân biệt mặc định với một chiến dịch', () => {
    expect(DefaultHomeLayout.campaignId).toBeNull();
  });

  it('hai khối phụ thuộc dữ liệu chiến dịch bị TẮT sẵn', () => {
    // Bật chúng khi không có chiến dịch nào là hứa một danh sách rỗng.
    const byType = new Map(
      DefaultHomeLayout.sectionsLayout.map((s) => [s.type, s.enabled]),
    );
    expect(byType.get('URGENT_CAMPAIGN_ITEMS')).toBe(false);
    expect(byType.get('CAMPAIGN_TOP_GIVERS')).toBe(false);
  });

  it('mọi khối mặc định đều có type nằm trong danh sách cho phép', () => {
    for (const section of DefaultHomeLayout.sectionsLayout)
      expect(HomeSectionTypes).toContain(section.type);
  });

  it('order của bố cục mặc định liên tục từ 1', () => {
    expect(DefaultHomeLayout.sectionsLayout.map((s) => s.order)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });
});

describe('kiểm giá trị', () => {
  it('màu chỉ nhận hex 3 hoặc 6 ký tự', () => {
    expect(isHomeColor('#10B981')).toBe(true);
    expect(isHomeColor('#abc')).toBe(true);
    // Tên màu CSS và rgb() không dùng được ở client Flutter.
    expect(isHomeColor('red')).toBe(false);
    expect(isHomeColor('rgb(1,2,3)')).toBe(false);
    expect(isHomeColor('#12345')).toBe(false);
    expect(isHomeColor('10B981')).toBe(false);
    expect(isHomeColor(null)).toBe(false);
  });

  it('ảnh phải https — http bị iOS chặn và hiện khung trắng', () => {
    expect(isHomeImageUrl('https://cdn.chantam.vn/a.webp')).toBe(true);
    expect(isHomeImageUrl('http://cdn.chantam.vn/a.webp')).toBe(false);
    expect(isHomeImageUrl('//cdn.chantam.vn/a.webp')).toBe(false);
    expect(isHomeImageUrl('a.webp')).toBe(false);
  });

  it('deep link chỉ nhận givingapp:// hoặc https://', () => {
    expect(isHomeDeepLink('givingapp://category/cuu-tro')).toBe(true);
    expect(isHomeDeepLink('https://chantam.vn/campaign/vu-lan')).toBe(true);
    // Đây là chỗ thiệt hại lan ra NGOÀI hệ thống nếu tài khoản Admin bị chiếm:
    // chuỗi này đi thẳng vào hàm mở link của app.
    expect(isHomeDeepLink('javascript:alert(1)')).toBe(false);
    expect(isHomeDeepLink('intent://scan/#Intent;end')).toBe(false);
    expect(isHomeDeepLink('file:///etc/passwd')).toBe(false);
    expect(isHomeDeepLink('http://chantam.vn')).toBe(false);
  });
});

describe('normalizeHomeTheme', () => {
  it('giá trị hỏng lùi về theme mặc định, không ném', () => {
    expect(normalizeHomeTheme(null)).toEqual(DefaultHomeLayout.theme);
    expect(normalizeHomeTheme({ primaryColor: 'xanh' }).primaryColor).toBe(
      DefaultHomeLayout.theme.primaryColor,
    );
  });

  it('lọc màu hỏng khỏi dải gradient thay vì bỏ cả dải', () => {
    const theme = normalizeHomeTheme({
      headerGradient: ['#F59E0B', 'vàng', '#D97706'],
    });
    expect(theme.headerGradient).toEqual(['#F59E0B', '#D97706']);
  });

  it('ảnh nền http bị loại về null', () => {
    expect(
      normalizeHomeTheme({ backgroundPatternUrl: 'http://x.vn/a.png' })
        .backgroundPatternUrl,
    ).toBeNull();
  });
});

describe('normalizeHomeBanners', () => {
  it('banner không ảnh bị bỏ — đó là ô trống trên slider', () => {
    const banners = normalizeHomeBanners([
      { id: 'b1', title: 'Không ảnh' },
      { id: 'b2', imageUrl: 'https://cdn.chantam.vn/b.webp', title: 'Có ảnh' },
    ]);
    expect(banners).toHaveLength(1);
    expect(banners[0].id).toBe('b2');
  });

  it('khử id trùng — key trùng làm client dựng lại slider sai khi cuộn', () => {
    const banners = normalizeHomeBanners([
      { id: 'b1', imageUrl: 'https://cdn.chantam.vn/1.webp' },
      { id: 'b1', imageUrl: 'https://cdn.chantam.vn/2.webp' },
    ]);
    expect(banners).toHaveLength(1);
  });

  it('thiếu id thì sinh theo vị trí', () => {
    const banners = normalizeHomeBanners([
      { imageUrl: 'https://cdn.chantam.vn/1.webp' },
    ]);
    expect(banners[0].id).toBe('b1');
  });

  it('deep link hỏng về null nhưng banner vẫn giữ', () => {
    const banners = normalizeHomeBanners([
      {
        id: 'b1',
        imageUrl: 'https://cdn.chantam.vn/1.webp',
        deepLink: 'javascript:alert(1)',
      },
    ]);
    expect(banners).toHaveLength(1);
    expect(banners[0].deepLink).toBeNull();
  });

  it('cắt ở trần số banner', () => {
    const many = Array.from({ length: MaxHomeBanners + 5 }, (_, i) => ({
      id: `b${i}`,
      imageUrl: 'https://cdn.chantam.vn/x.webp',
    }));
    expect(normalizeHomeBanners(many)).toHaveLength(MaxHomeBanners);
  });

  it('không phải mảng thì trả rỗng', () => {
    expect(normalizeHomeBanners('x')).toEqual([]);
    expect(normalizeHomeBanners(null)).toEqual([]);
  });
});

describe('normalizeHomeSections', () => {
  it('bỏ khối có type lạ — client không dựng được component tùy ý', () => {
    const sections = normalizeHomeSections([
      { id: 'a', type: 'HERO_BANNER_SLIDER', order: 1 },
      { id: 'b', type: 'CRYPTO_TICKER', order: 2 },
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe('HERO_BANNER_SLIDER');
  });

  it('đánh số lại order từ 1, kể cả khi Admin để trùng', () => {
    // Hai khối cùng order làm client sắp theo cách duyệt mảng — hai máy hiện hai
    // thứ tự khác nhau từ cùng một cấu hình.
    const sections = normalizeHomeSections([
      { id: 'a', type: 'NEARBY_POSTS_GRID', order: 5 },
      { id: 'b', type: 'HERO_BANNER_SLIDER', order: 5 },
      { id: 'c', type: 'VIDEO_SHORTS_FEED', order: 2 },
    ]);
    expect(sections.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(sections[0].id).toBe('c');
  });

  it('order thiếu thì xuống cuối, không thành NaN', () => {
    const sections = normalizeHomeSections([
      { id: 'a', type: 'NEARBY_POSTS_GRID' },
      { id: 'b', type: 'HERO_BANNER_SLIDER', order: 1 },
    ]);
    expect(sections.map((s) => s.id)).toEqual(['b', 'a']);
    expect(sections.every((s) => Number.isInteger(s.order))).toBe(true);
  });

  it('khử id trùng', () => {
    const sections = normalizeHomeSections([
      { id: 'a', type: 'HERO_BANNER_SLIDER', order: 1 },
      { id: 'a', type: 'VIDEO_SHORTS_FEED', order: 2 },
    ]);
    expect(sections).toHaveLength(1);
  });

  it('id sai dạng bị bỏ', () => {
    expect(
      normalizeHomeSections([
        { id: 'Khối Một', type: 'HERO_BANNER_SLIDER', order: 1 },
      ]),
    ).toEqual([...DefaultHomeLayout.sectionsLayout]);
  });

  it('rỗng hoặc hỏng hết thì về bố cục mặc định, không trả trang trắng', () => {
    expect(normalizeHomeSections([])).toEqual([
      ...DefaultHomeLayout.sectionsLayout,
    ]);
    expect(normalizeHomeSections(null)).toEqual([
      ...DefaultHomeLayout.sectionsLayout,
    ]);
    expect(normalizeHomeSections([{ type: 'BAD' }])).toEqual([
      ...DefaultHomeLayout.sectionsLayout,
    ]);
  });

  it('enabled thiếu khoá thì BẬT', () => {
    const sections = normalizeHomeSections([
      { id: 'a', type: 'HERO_BANNER_SLIDER', order: 1 },
    ]);
    expect(sections[0].enabled).toBe(true);
  });
});

describe('normalizeHomePopup / FloatingBanner', () => {
  it('popup không ảnh thì null', () => {
    expect(normalizeHomePopup({ deepLink: 'givingapp://x' })).toBeNull();
    expect(
      normalizeHomePopup({ imageUrl: 'https://cdn.chantam.vn/p.webp' }),
    ).toEqual({ imageUrl: 'https://cdn.chantam.vn/p.webp', deepLink: null });
  });

  it('nút nổi không chữ thì null — một ô màu không ai biết bấm để làm gì', () => {
    expect(
      normalizeHomeFloatingBanner({ deepLink: 'givingapp://x' }),
    ).toBeNull();
    expect(normalizeHomeFloatingBanner({ label: '   ' })).toBeNull();
    expect(
      normalizeHomeFloatingBanner({
        label: 'Ủng hộ ngay',
        deepLink: 'givingapp://campaign/vu-lan',
      }),
    ).toEqual({
      label: 'Ủng hộ ngay',
      deepLink: 'givingapp://campaign/vu-lan',
    });
  });
});

describe('homeCampaignGaps', () => {
  const window = {
    startTime: new Date('2026-08-01T00:00:00Z'),
    endTime: new Date('2026-08-31T23:59:59Z'),
  };
  const sections = [...DefaultHomeLayout.sectionsLayout];

  it('bản nháp thiếu thứ vẫn lưu được', () => {
    // Chặn lưu nháp là buộc Admin dựng xong cả chiến dịch trong một lần ngồi.
    expect(
      homeCampaignGaps({ ...window, isActive: false, sectionsLayout: [] }),
    ).toEqual([]);
  });

  it('khoảng thời gian ngược bị chặn kể cả khi còn nháp', () => {
    const gaps = homeCampaignGaps({
      startTime: window.endTime,
      endTime: window.startTime,
      isActive: false,
      sectionsLayout: sections,
    });
    expect(gaps).toEqual(['endTime phải sau startTime']);
  });

  it('endTime bằng startTime cũng bị chặn', () => {
    expect(
      homeCampaignGaps({
        startTime: window.startTime,
        endTime: window.startTime,
        isActive: true,
        sectionsLayout: sections,
      }),
    ).toContain('endTime phải sau startTime');
  });

  it('ngày không hợp lệ báo riêng, không chạy tiếp so sánh', () => {
    const gaps = homeCampaignGaps({
      startTime: new Date('khong-phai-ngay'),
      endTime: window.endTime,
      isActive: true,
      sectionsLayout: sections,
    });
    expect(gaps).toEqual(['startTime không phải thời điểm hợp lệ']);
  });

  it('bật mà không khối nào đang bật thì bị chặn', () => {
    const gaps = homeCampaignGaps({
      ...window,
      isActive: true,
      sectionsLayout: sections.map((s) => ({ ...s, enabled: false })),
    });
    expect(gaps).toContain(
      'cần ít nhất một khối đang bật khi kích hoạt chiến dịch',
    );
  });

  it('bật với bố cục hợp lệ thì không còn gap', () => {
    expect(
      homeCampaignGaps({ ...window, isActive: true, sectionsLayout: sections }),
    ).toEqual([]);
  });
});
