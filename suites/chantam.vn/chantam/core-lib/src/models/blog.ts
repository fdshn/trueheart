/**
 * Blog / Tin tức — phần THUẦN (SRS §6.2.12 `blogs`, UC-BLOG-01, F64).
 *
 * ## Vì sao bộ lọc HTML KHÔNG nằm ở đây
 *
 * Bản đầu của file này gọi thẳng `sanitize-html`. Sai, theo invariant 7: `core-lib` là
 * contract dùng chung mà *"sau này Next.js web/admin import trực tiếp"*. Nhét
 * `sanitize-html` vào đây là kéo `htmlparser2` và `postcss` — một bộ parse HTML phía
 * server — vào bundle trình duyệt, chỉ để dùng vài hằng số và một hàm sinh slug.
 *
 * Nên bộ lọc thành `IHtmlSanitizer` ở `core/src/domain/ports/security`, hiện thực ở
 * `core/src/infrastructure/security` — cùng khuôn `ISecretCipher` / `AesSecretCipher`.
 *
 * Hệ quả thấy được trong file này: `blogGaps` nhận `contentTextLength` **đã tính sẵn**
 * thay vì tự đếm. Phụ thuộc trở thành tham số, và đó là cách duy nhất giữ hàm này thuần.
 */

/** Bốn chuyên mục của UC-BLOG-01. */
export const BlogCategories = [
  'PHAT_PHAP',
  'GUONG_SANG',
  'CHIEN_DICH',
  'SONG_XANH',
] as const;

export type BlogCategory = (typeof BlogCategories)[number];

export const BlogCategoryLabels: Readonly<Record<BlogCategory, string>> = {
  PHAT_PHAP: 'Phật Pháp',
  GUONG_SANG: 'Gương Sáng',
  CHIEN_DICH: 'Nhật Ký Chiến Dịch',
  SONG_XANH: 'Sống Xanh',
};

export const MaxBlogTitleLength = 255;
export const MaxBlogSlugLength = 255;
export const MaxBlogSummaryLength = 1_000;
/**
 * Trần độ dài nội dung sau khi lọc.
 *
 * Cột là `TEXT` nên database không chặn gì; trần ở đây để một lượt dán 50MB không thành
 * một hàng không ai đọc nổi và một response không client nào dựng nổi.
 */
export const MaxBlogContentLength = 200_000;

const VietnameseD = /[đĐ]/g;
const NonSlugChars = /[^a-z0-9]+/g;

/**
 * Sinh slug từ tiêu đề tiếng Việt.
 *
 * `normalize('NFD')` tách dấu ra khỏi chữ rồi bỏ dấu, nhưng nó **không** xử lý được `đ`:
 * `đ` là một chữ riêng trong Unicode, không phải `d` cộng dấu, nên nó rơi vào nhóm bị
 * `NonSlugChars` xoá và "đồ dùng" thành "o-dung". Vì vậy phải đổi `đ` trước khi NFD.
 */
export function slugifyBlogTitle(title: string): string {
  const slug = title
    .replace(VietnameseD, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(NonSlugChars, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MaxBlogSlugLength);

  // Tiêu đề toàn ký tự lạ (emoji, chữ Hán) ra slug rỗng, mà cột `UNIQUE NOT NULL` —
  // bài thứ hai như vậy sẽ đụng khoá. Bên gọi phải thấy chuỗi rỗng để tự gắn hậu tố.
  return slug;
}

/** `slug` người dùng gõ tay: chuẩn hoá y hệt, để không có hai cách viết cho một đường. */
export function normalizeBlogSlug(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return slugifyBlogTitle(raw);
}

export function normalizeBlogSummary(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, MaxBlogSummaryLength);
}

export function isBlogThumbnailUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('https://') &&
    value.length <= 2_000
  );
}

/**
 * Những chỗ khiến bài KHÔNG xuất bản được.
 *
 * Cùng lối `homeCampaignGaps`: bản nháp thiếu thứ vẫn lưu được, chỉ lượt **xuất bản** mới
 * đòi đủ. Admin soạn bài qua nhiều buổi là chuyện thường, chặn lưu nháp là buộc họ viết
 * xong trong một lần ngồi.
 *
 * Riêng `title` và `slug` kiểm cả khi còn nháp: cột `UNIQUE NOT NULL` không nhận rỗng, nên
 * để lọt tới database là đổi một thông báo đọc được thành một lỗi ràng buộc.
 */
export function blogGaps(input: {
  readonly isPublished: boolean;
  readonly title: string;
  readonly slug: string;
  /**
   * Số ký tự CHỮ còn lại sau khi lọc HTML — do `IHtmlSanitizer.textLength` tính.
   *
   * Không nhận chuỗi HTML rồi tự đếm: `<p></p><p>   </p>` lọc xong vẫn là HTML hợp lệ và
   * `length > 0`, nên đếm theo độ dài chuỗi sẽ cho một bài TRẮNG xuất bản được.
   */
  readonly contentTextLength: number;
  readonly thumbnailUrl: unknown;
}): string[] {
  const gaps: string[] = [];

  if (input.title.trim().length < 3) gaps.push('title phải có ít nhất 3 ký tự');
  if (input.slug.length === 0)
    gaps.push(
      'slug rỗng sau khi chuẩn hoá — tiêu đề cần ít nhất một chữ hoặc số Latin, ' +
        'hoặc gửi slug riêng',
    );

  if (!input.isPublished) return gaps;

  if (input.contentTextLength < 1)
    gaps.push('contentHtml không còn nội dung nào sau khi lọc HTML');
  if (!isBlogThumbnailUrl(input.thumbnailUrl))
    gaps.push('thumbnailUrl phải là một đường dẫn https khi xuất bản');

  return gaps;
}
