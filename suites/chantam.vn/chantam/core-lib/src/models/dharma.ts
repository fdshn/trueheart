/**
 * Phật Pháp — engine nội dung dùng chung và lịch sử tụng kinh (SRS UI-DHARMA-01,
 * UC-DHARMA-01, UC-DHARMA-02, BR-DHARMA-01, F73).
 *
 * ## MỘT engine cho ba loại nội dung, không ba bảng
 *
 * BR-DHARMA-01: *"Kinh sách, Thông tin và Giới thiệu chùa phải ưu tiên mô hình
 * content_type/category dùng chung thay vì tạo engine dữ liệu riêng cho từng loại nội
 * dung."*
 *
 * Nên một bảng `dharma_contents` với `content_type`. Ba bảng gần giống nhau là ba lượt sửa
 * mỗi lần thêm một trường, và ba đường đọc để quên lọc `is_published` ở một trong số đó.
 *
 * ## Vì sao KHÔNG dùng lại bảng `blogs`
 *
 * `blogs` cũng là nội dung có `title`/`slug`/`is_published`, nên thoạt nhìn gộp được. Nhưng
 * `blogs.category` có `CHECK` bốn chuyên mục báo chí (`PHAT_PHAP`, `GUONG_SANG`,
 * `CHIEN_DICH`, `SONG_XANH`), và `blogs` không có `audio_url` — thứ UC-DHARMA-02 cần. Gộp
 * nghĩa là nới `CHECK` đó cho mọi danh mục kinh sách, tức bỏ hẳn ràng buộc đang bảo vệ
 * chuyên mục blog, rồi thêm một cột chỉ một nửa số hàng dùng tới.
 *
 * Hai engine cho hai loại nội dung KHÁC nhau không vi phạm BR-DHARMA-01 — điều nó cấm là
 * một engine riêng *cho từng loại trong nhóm Phật Pháp*.
 *
 * ## `category` là chuỗi tự do đã chuẩn hoá, KHÁC `BannerPlacements`
 *
 * Ở banner tôi làm `placement` thành allowlist cứng, vì một vị trí không client nào dựng
 * nghĩa là banner **không hiện mà không có lỗi nào**. Ở đây ngược lại: ba loại nội dung có
 * ba tập danh mục rời nhau (bộ kinh, loại thông tin, vùng miền của chùa), và một allowlist
 * sẽ phải nới mỗi lần Bên A thêm một bộ kinh.
 *
 * Danh mục gõ sai thì **thấy ngay**: nó hiện thành một giá trị lọc riêng trong danh sách
 * Admin, cạnh giá trị đúng. Đó là khác biệt quyết định — sai mà thấy được thì không cần
 * database chặn.
 */

/** Ba loại nội dung của engine dùng chung (UC-DHARMA-01). */
export const DharmaContentTypes = ['SUTRA', 'INFO', 'TEMPLE_INTRO'] as const;

export type DharmaContentType = (typeof DharmaContentTypes)[number];

export const DharmaContentTypeLabels: Readonly<
  Record<DharmaContentType, string>
> = {
  SUTRA: 'Kinh sách',
  INFO: 'Thông tin',
  TEMPLE_INTRO: 'Giới thiệu chùa',
};

export const MaxDharmaTitleLength = 255;
export const MaxDharmaSlugLength = 255;
export const MaxDharmaCategoryLength = 50;
export const MaxDharmaSummaryLength = 1_000;
/**
 * Trần nội dung. Một bộ kinh dài hơn một bài blog rất nhiều — Kinh Pháp Hoa bản Việt vào
 * khoảng 600 nghìn ký tự — nên trần phải rộng hơn `MaxBlogContentLength` (200 nghìn).
 */
export const MaxDharmaBodyLength = 2_000_000;

/** Entry trên Dharma Hub (UI-DHARMA-01), theo đúng thứ tự đặc tả liệt kê. */
export const DharmaHubEntries = [
  'SUTRA',
  'RECITATION',
  'DEDICATION',
  'MERIT',
  'FORUM',
  'INFO',
  'TEMPLE_INTRO',
] as const;

export type DharmaHubEntry = (typeof DharmaHubEntries)[number];

/**
 * Đường API mỗi entry trỏ tới.
 *
 * `MERIT` trỏ sang `/merit-units` — UC-DHARMA-05 nói rõ *"Tái sử dụng nghiệp vụ Công
 * đức/Hồi hướng tại mục 3.3.11"*, nên Phật Pháp KHÔNG có bảng hay endpoint công đức riêng.
 * Dựng một bản thứ hai ở đây là hai nguồn cho cùng một số tài khoản ngân hàng, và lúc đó
 * sửa một nơi là để nơi kia trỏ sai dòng tiền.
 */
export const DharmaHubEntryPaths: Readonly<Record<DharmaHubEntry, string>> = {
  SUTRA: '/dharma/contents?contentType=SUTRA',
  RECITATION: '/dharma/recitations/mine',
  DEDICATION: '/dharma/dedications',
  MERIT: '/merit-units',
  FORUM: '/dharma/threads',
  INFO: '/dharma/contents?contentType=INFO',
  TEMPLE_INTRO: '/dharma/contents?contentType=TEMPLE_INTRO',
};

const VietnameseD = /[đĐ]/g;
const NonSlugChars = /[^a-z0-9]+/g;
const Diacritics = /[̀-ͯ]/g;

/**
 * Sinh slug từ tiêu đề tiếng Việt.
 *
 * Cùng thuật toán với `slugifyBlogTitle`, và viết lại ở đây thay vì import nó: `models/blog`
 * là contract của phân hệ Blog, còn Phật Pháp là phân hệ khác với trần độ dài khác. Ở
 * `models/charity-campaign` tôi đã dùng lại hàm của Blog vì trần chỉ hẹp hơn; ở đây hai thứ
 * không còn quan hệ gì ngoài việc tình cờ giống thuật toán.
 *
 * Chỗ khó vẫn là `đ`: nó là một chữ RIÊNG trong Unicode, không phải `d` cộng dấu, nên
 * `normalize('NFD')` không tách được và nó rơi vào nhóm bị xoá. Phải đổi `đ` TRƯỚC khi NFD,
 * nếu không "Kinh Địa Tạng" ra "kinh-ia-tang".
 */
export function slugifyDharmaTitle(title: string): string {
  return title
    .replace(VietnameseD, 'd')
    .normalize('NFD')
    .replace(Diacritics, '')
    .toLowerCase()
    .replace(NonSlugChars, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MaxDharmaSlugLength);
}

export function normalizeDharmaSlug(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return slugifyDharmaTitle(raw);
}

/**
 * Chuẩn hoá danh mục về dạng slug.
 *
 * Để "Kinh Đại Thừa", "kinh dai thua" và "Kinh  Đại  Thừa" cùng về một giá trị. Không chuẩn
 * hoá thì ba cách gõ thành ba danh mục, và bộ lọc của người dùng chỉ ra một phần ba số hàng
 * lẽ ra phải thấy.
 */
export function normalizeDharmaCategory(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const slug = slugifyDharmaTitle(raw).slice(0, MaxDharmaCategoryLength);
  return slug.length > 0 ? slug : null;
}

export function isDharmaHttpsUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('https://') &&
    value.length <= 2_000
  );
}

/**
 * Những chỗ khiến một nội dung KHÔNG xuất bản được.
 *
 * Cùng lối `blogGaps`: bản nháp thiếu thứ vẫn lưu được, chỉ lượt **xuất bản** mới đòi đủ.
 * Admin soạn một bộ kinh qua nhiều buổi là chuyện thường, chặn lưu nháp là buộc họ dán xong
 * 600 nghìn ký tự trong một lần ngồi.
 *
 * `title` và `slug` kiểm cả khi còn nháp: cột `UNIQUE NOT NULL` không nhận rỗng, nên để lọt
 * tới database là đổi một thông báo đọc được thành một lỗi ràng buộc.
 */
export function dharmaContentGaps(input: {
  readonly isPublished: boolean;
  readonly contentType: unknown;
  readonly title: string;
  readonly slug: string;
  readonly bodyText: string;
  readonly audioUrl: unknown;
  readonly coverUrl: unknown;
}): string[] {
  const gaps: string[] = [];

  if (input.title.trim().length < 3) gaps.push('title phải có ít nhất 3 ký tự');
  if (input.title.length > MaxDharmaTitleLength)
    gaps.push(`title không vượt ${MaxDharmaTitleLength} ký tự`);
  if (input.slug.length === 0)
    gaps.push(
      'slug rỗng sau khi chuẩn hoá — tiêu đề cần ít nhất một chữ hoặc số Latin, ' +
        'hoặc gửi slug riêng',
    );

  if (!DharmaContentTypes.includes(input.contentType as DharmaContentType))
    gaps.push(
      `contentType phải là một trong: ${DharmaContentTypes.join(', ')}`,
    );

  if (input.bodyText.length > MaxDharmaBodyLength)
    gaps.push(`bodyText không vượt ${MaxDharmaBodyLength} ký tự`);

  // Hai đường dẫn TUỲ CHỌN, nhưng nếu có gửi thì phải là https. Audio qua `http` làm
  // trình duyệt và iOS chặn phát, và lỗi đó chỉ hiện lúc người dùng bấm Nghe.
  if (
    input.audioUrl !== undefined &&
    input.audioUrl !== null &&
    !isDharmaHttpsUrl(input.audioUrl)
  )
    gaps.push('audioUrl phải là một đường dẫn https');
  if (
    input.coverUrl !== undefined &&
    input.coverUrl !== null &&
    !isDharmaHttpsUrl(input.coverUrl)
  )
    gaps.push('coverUrl phải là một đường dẫn https');

  if (!input.isPublished) return gaps;

  if (input.bodyText.trim().length === 0)
    gaps.push('bodyText không được rỗng khi xuất bản');

  return gaps;
}

/**
 * Nội dung này có tụng/nghe được không (UC-DHARMA-02).
 *
 * Chỉ `SUTRA`. Mở cho `INFO` và `TEMPLE_INTRO` là cho người dùng "đánh dấu đã tụng xong"
 * một trang giới thiệu chùa, và lịch sử tụng kinh mất nghĩa.
 *
 * KHÔNG đòi có `audioUrl`: UC-DHARMA-02 nói *"xem nội dung text và audio **nếu Admin đã cấu
 * hình**"*, nên tụng theo bản chữ là đường chính, audio là phần thêm.
 */
export function isRecitableDharmaContent(input: {
  readonly contentType: DharmaContentType;
  readonly isPublished: boolean;
}): boolean {
  return input.contentType === 'SUTRA' && input.isPublished;
}
