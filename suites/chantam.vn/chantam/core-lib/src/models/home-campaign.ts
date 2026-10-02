/**
 * Home động theo chiến dịch (SRS §6.2.11 `home_campaign_configs`, UC-ADM-03, F63).
 *
 * ## Hai điều quyết định toàn bộ thiết kế dưới đây
 *
 * **1. Client chỉ vẽ được component nó đã biết.** UC-ADM-03 bước 7 nói thẳng: *"Cấu hình
 * từ CMS không được tạo component tùy ý"*. Nên `type` của mỗi khối phải nằm trong danh
 * sách cho phép, kiểm ở tầng ghi. Nhận một `type` lạ rồi lưu là dựng đúng cái bẫy đã bắt
 * nhiều lần ở repo này, chỉ là từ phía ngược lại: Admin kéo thả, bấm Lưu, thấy lưu được,
 * và khối đó không bao giờ hiện trên máy ai.
 *
 * **2. Không có chiến dịch nào thì vẫn phải có Home.** BR_CAMP_02 đòi fallback về Home mặc
 * định. Nên `DefaultHomeLayout` là một bố cục THẬT, không phải `null`: trả `null` hay 404
 * nghĩa là app không có gì để vẽ trong mọi khoảng thời gian giữa hai chiến dịch — tức
 * phần lớn thời gian của năm.
 *
 * ## Ba cách gọi tên cho cùng một trường, trong cùng một đặc tả
 *
 * SRS gọi ảnh nền theme bằng ba tên khác nhau: `bg_image_url` (bảng §6.2.11),
 * `background_image_url` (luồng UC-ADM-03 bước 2), `background_pattern_url` (response mẫu
 * §7.2.6). Tương tự `gradient_colors` / `header_gradient`, và "icon lễ hội" /
 * `greeting_icon`.
 *
 * Ở đây lấy theo **response mẫu**, vì đó là hợp đồng trên đường truyền — thứ client
 * Flutter thật sự đọc. Hai tên kia là văn mô tả.
 *
 * ## Hai cột có trong bảng mà vắng trong response mẫu
 *
 * `popup_config` và `floating_banner` được §6.2.11 khai nhưng response mẫu §7.2.6 không
 * nhắc. Ở đây **vẫn trả ra**: lưu một cột rồi không bao giờ đọc là làm ra cột chết, và
 * client không biết khoá lạ thì bỏ qua — thêm vào an toàn hơn bỏ đi.
 */

/**
 * Các khối Home mà client dựng được.
 *
 * Năm giá trị này lấy đúng từ response mẫu §7.2.6. Thêm khối mới thì thêm ở đây **cùng
 * ngày** với lượt client hỗ trợ nó, không sớm hơn.
 */
export const HomeSectionTypes = [
  'HERO_BANNER_SLIDER',
  'URGENT_CAMPAIGN_ITEMS',
  'VIDEO_SHORTS_FEED',
  'CAMPAIGN_TOP_GIVERS',
  'NEARBY_POSTS_GRID',
] as const;

export type HomeSectionType = (typeof HomeSectionTypes)[number];

/**
 * Giao thức được phép cho deep link và ảnh.
 *
 * `givingapp://` là deep link trong app; `https://` cho ảnh CDN và link web. Chặn mọi thứ
 * khác là có chủ ý: một ô text tự do đi thẳng vào hàm mở link của app là đường để
 * `javascript:` hay `intent://` lọt xuống máy người dùng. Admin bị chiếm tài khoản thì đây
 * là chỗ thiệt hại lan ra ngoài hệ thống.
 */
export const HomeDeepLinkScheme = 'givingapp://';
export const HomeHttpsScheme = 'https://';

export interface IHomeTheme {
  readonly primaryColor: string;
  readonly backgroundPatternUrl: string | null;
  /** Dải màu header, theo thứ tự. Rỗng nghĩa là client dùng màu phẳng. */
  readonly headerGradient: readonly string[];
  readonly greetingIcon: string | null;
}

export interface IHomeBanner {
  readonly id: string;
  readonly imageUrl: string;
  readonly title: string;
  readonly ctaText: string | null;
  readonly deepLink: string | null;
}

export interface IHomeSection {
  readonly id: string;
  readonly type: HomeSectionType;
  readonly title: string | null;
  readonly enabled: boolean;
  readonly order: number;
}

export interface IHomePopup {
  readonly imageUrl: string;
  readonly deepLink: string | null;
}

export interface IHomeFloatingBanner {
  readonly label: string;
  readonly deepLink: string | null;
}

/** Hình dạng trên đường truyền của `GET /config/home-layout`. */
export interface IHomeLayout {
  readonly campaignId: string | null;
  readonly campaignName: string;
  readonly theme: IHomeTheme;
  readonly marqueeText: string | null;
  readonly banners: readonly IHomeBanner[];
  readonly sectionsLayout: readonly IHomeSection[];
  readonly popup: IHomePopup | null;
  readonly floatingBanner: IHomeFloatingBanner | null;
}

/** Khoá Redis mà UC-ADM-03 bước 5 gọi tên. */
export const HomeLayoutCacheKey = 'cache:home_layout_config';

/** TTL 1 giờ, theo §7.2.6. */
export const HomeLayoutCacheTtlSeconds = 3_600;

export const MaxHomeBanners = 10;
export const MaxHomeSections = HomeSectionTypes.length * 2;

/**
 * Home khi KHÔNG chiến dịch nào đang hiệu lực (BR_CAMP_02).
 *
 * `campaignId: null` là tín hiệu để client biết đây là bố cục mặc định, không phải một
 * chiến dịch tên "Chân Tâm". Màu lấy từ màu thương hiệu; không ảnh nền, không marquee,
 * không banner — mặc định phải chạy được khi chưa ai tải lên gì.
 *
 * Ba khối bật sẵn là ba khối không cần dữ liệu chiến dịch: banner slider (rỗng thì client
 * tự ẩn), video ngắn, và đồ quanh bạn. Hai khối còn lại
 * (`URGENT_CAMPAIGN_ITEMS`, `CAMPAIGN_TOP_GIVERS`) **tắt**: cả hai đọc dữ liệu theo chiến
 * dịch, mà lúc này không có chiến dịch nào, nên bật chúng là hứa một danh sách rỗng.
 */
export const DefaultHomeLayout: IHomeLayout = {
  campaignId: null,
  campaignName: 'Chân Tâm',
  theme: {
    primaryColor: '#10B981',
    backgroundPatternUrl: null,
    headerGradient: [],
    greetingIcon: null,
  },
  marqueeText: null,
  banners: [],
  sectionsLayout: [
    {
      id: 'sec_hero',
      type: 'HERO_BANNER_SLIDER',
      title: null,
      enabled: true,
      order: 1,
    },
    {
      id: 'sec_shorts',
      type: 'VIDEO_SHORTS_FEED',
      title: 'Câu Chuyện Sẻ Chia',
      enabled: true,
      order: 2,
    },
    {
      id: 'sec_nearby',
      type: 'NEARBY_POSTS_GRID',
      title: 'Đồ Quanh Bạn',
      enabled: true,
      order: 3,
    },
    {
      id: 'sec_urgent',
      type: 'URGENT_CAMPAIGN_ITEMS',
      title: 'Đồ Quyên Góp Cần Gấp',
      enabled: false,
      order: 4,
    },
    {
      id: 'sec_leaderboard',
      type: 'CAMPAIGN_TOP_GIVERS',
      title: 'Bảng Vàng Cống Hiến',
      enabled: false,
      order: 5,
    },
  ],
  popup: null,
  floatingBanner: null,
};

const HexColorPattern = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const SectionIdPattern = /^[a-z0-9_-]{1,40}$/;

/** `#ABC` hoặc `#AABBCC`, không nhận tên màu CSS và không nhận `rgb()`. */
export function isHomeColor(value: unknown): value is string {
  return typeof value === 'string' && HexColorPattern.test(value);
}

/** Ảnh phải là `https://` — ảnh `http://` bị chặn trên iOS và hiện ra khung trắng. */
export function isHomeImageUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith(HomeHttpsScheme) &&
    value.length <= 2_000
  );
}

/** Deep link chỉ nhận `givingapp://` hoặc `https://`. */
export function isHomeDeepLink(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value.startsWith(HomeDeepLinkScheme) ||
      value.startsWith(HomeHttpsScheme)) &&
    value.length <= 2_000
  );
}

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLength);
}

export function normalizeHomeTheme(raw: unknown): IHomeTheme {
  if (typeof raw !== 'object' || raw === null) return DefaultHomeLayout.theme;
  const source = raw as Record<string, unknown>;

  const gradient = Array.isArray(source.headerGradient)
    ? source.headerGradient.filter(isHomeColor).slice(0, 4)
    : [];

  return {
    primaryColor: isHomeColor(source.primaryColor)
      ? source.primaryColor
      : DefaultHomeLayout.theme.primaryColor,
    backgroundPatternUrl: isHomeImageUrl(source.backgroundPatternUrl)
      ? source.backgroundPatternUrl
      : null,
    headerGradient: gradient,
    greetingIcon: readText(source.greetingIcon, 50),
  };
}

export function normalizeHomeBanners(raw: unknown): IHomeBanner[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const banners: IHomeBanner[] = [];

  for (const [index, item] of raw.entries()) {
    if (typeof item !== 'object' || item === null) continue;
    const source = item as Record<string, unknown>;

    // Banner không có ảnh là một ô trống trên slider — bỏ, không giữ lại.
    if (!isHomeImageUrl(source.imageUrl)) continue;

    const id = readText(source.id, 40) ?? `b${index + 1}`;
    // Trùng `id` làm client dựng lại danh sách sai khi cuộn slider (key trùng).
    if (seen.has(id)) continue;
    seen.add(id);

    banners.push({
      id,
      imageUrl: source.imageUrl,
      title: readText(source.title, 200) ?? '',
      ctaText: readText(source.ctaText, 50),
      deepLink: isHomeDeepLink(source.deepLink) ? source.deepLink : null,
    });

    if (banners.length >= MaxHomeBanners) break;
  }

  return banners;
}

/**
 * Chuẩn hoá danh sách khối.
 *
 * Ba việc, theo thứ tự: bỏ khối có `type` lạ hoặc `id` sai dạng, khử trùng `id`, rồi sắp
 * theo `order` và **đánh số lại từ 1**. Đánh số lại là chỗ dễ bỏ qua: Admin kéo thả có thể
 * để lại `order` trùng nhau hoặc nhảy bậc, và client sắp theo số đó sẽ cho thứ tự tuỳ cách
 * duyệt mảng — tức hai máy hiện hai thứ tự khác nhau từ cùng một cấu hình.
 *
 * Danh sách rỗng (hoặc hỏng hoàn toàn) trả về bố cục mặc định chứ không trả rỗng: một Home
 * không khối nào là một trang trắng.
 */
export function normalizeHomeSections(raw: unknown): IHomeSection[] {
  if (!Array.isArray(raw)) return [...DefaultHomeLayout.sectionsLayout];

  const seen = new Set<string>();
  const sections: Array<IHomeSection & { rawOrder: number }> = [];

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const source = item as Record<string, unknown>;

    const type = source.type;
    if (!HomeSectionTypes.includes(type as HomeSectionType)) continue;

    const id = readText(source.id, 40);
    if (id === null || !SectionIdPattern.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    const parsedOrder = Number(source.order);

    sections.push({
      id,
      type: type as HomeSectionType,
      title: readText(source.title, 100),
      enabled: source.enabled !== false,
      order: 0,
      rawOrder: Number.isFinite(parsedOrder)
        ? parsedOrder
        : Number.MAX_SAFE_INTEGER,
    });

    if (sections.length >= MaxHomeSections) break;
  }

  if (sections.length === 0) return [...DefaultHomeLayout.sectionsLayout];

  return sections
    .sort((a, b) => a.rawOrder - b.rawOrder)
    .map((section, index) => ({
      id: section.id,
      type: section.type,
      title: section.title,
      enabled: section.enabled,
      order: index + 1,
    }));
}

export function normalizeHomePopup(raw: unknown): IHomePopup | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;

  // Popup không ảnh thì không có gì để hiện.
  if (!isHomeImageUrl(source.imageUrl)) return null;

  return {
    imageUrl: source.imageUrl,
    deepLink: isHomeDeepLink(source.deepLink) ? source.deepLink : null,
  };
}

export function normalizeHomeFloatingBanner(
  raw: unknown,
): IHomeFloatingBanner | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;

  const label = readText(source.label, 80);
  // Nút nổi không chữ là một ô màu không ai biết bấm để làm gì.
  if (label === null) return null;

  return {
    label,
    deepLink: isHomeDeepLink(source.deepLink) ? source.deepLink : null,
  };
}

/**
 * Những chỗ khiến một cấu hình KHÔNG bật được.
 *
 * Khác các `*PolicyGaps` còn lại: ở đây chỉ chặn khi Admin **bật** (`isActive`). Một bản
 * nháp thiếu đủ thứ là chuyện bình thường — chặn lưu nháp là buộc Admin dựng xong cả
 * chiến dịch trong một lần ngồi.
 */
export function homeCampaignGaps(input: {
  readonly isActive: boolean;
  readonly startTime: Date;
  readonly endTime: Date;
  readonly sectionsLayout: readonly IHomeSection[];
}): string[] {
  const gaps: string[] = [];

  if (
    !(input.startTime instanceof Date) ||
    Number.isNaN(input.startTime.getTime())
  )
    gaps.push('startTime không phải thời điểm hợp lệ');
  if (!(input.endTime instanceof Date) || Number.isNaN(input.endTime.getTime()))
    gaps.push('endTime không phải thời điểm hợp lệ');

  if (gaps.length > 0) return gaps;

  // Kiểm cả khi còn nháp: một khoảng thời gian ngược là dữ liệu sai, không phải
  // dữ liệu chưa xong — và ràng buộc EXCLUDE dưới database sẽ từ chối nó muộn hơn
  // với thông báo khó đọc hơn.
  if (input.endTime.getTime() <= input.startTime.getTime())
    gaps.push('endTime phải sau startTime');

  if (!input.isActive) return gaps;

  if (input.sectionsLayout.length === 0)
    gaps.push('cần ít nhất một khối trong sectionsLayout khi bật');
  if (!input.sectionsLayout.some((section) => section.enabled))
    gaps.push('cần ít nhất một khối đang bật khi kích hoạt chiến dịch');

  return gaps;
}
