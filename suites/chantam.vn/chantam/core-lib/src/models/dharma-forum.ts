/**
 * Diễn đàn Phật Pháp và Hồi hướng — phần THUẦN (SRS UC-DHARMA-03, UC-DHARMA-04, F73 phần B).
 *
 * ## Diễn đàn TÁI DÙNG cơ chế có sẵn, và đo ra nó tái dùng được nhiều hơn tưởng
 *
 * UC-DHARMA-03: *"Diễn đàn tái sử dụng cơ chế Post/Comment/Like/Report/Moderation hiện có."*
 * Đo trước khi viết:
 *
 * - `content_subject_type_enum` dùng CHUNG cho `content_reactions` và `content_comments`, và
 *   nó **đã có `DHARMA_THREAD`** từ migration `1791500000000` — người viết nó để dành sẵn
 *   đúng cho lúc này. Nên thích và bình luận không cần một dòng migration nào.
 * - Bộ lọc từ ngữ (`screenText` + `ModerationTermsConfigKey`) đã chạy cho bình luận. Chủ đề
 *   đi qua đúng bộ đó: `BLOCK` thì từ chối, `REVIEW` thì vào `PENDING_REVIEW` để Admin xử.
 *   Đây chính là chữ "duyệt" của UC-DHARMA-03 — không phải một luồng duyệt trước khi hiện.
 * - `reports` thì cần thêm MỘT giá trị enum. Đó là toàn bộ phần migration của báo xấu.
 *
 * ## Vì sao chủ đề KHÔNG phải một `posts` row
 *
 * Gộp vào `posts` thì thoạt nhìn "tái dùng" hơn. Nhưng `posts` có `location` **NOT NULL**,
 * `category_id` NOT NULL trỏ vào danh mục VẬT PHẨM, `total_quantity`/`remaining_quantity`, và
 * `expires_at` theo vòng đời bài tặng. Một chủ đề thảo luận không có cái nào trong số đó.
 *
 * Và `content_subject_type_enum` đã tách `DHARMA_THREAD` khỏi `POST` ngay từ đầu, tức thiết
 * kế gốc đã quyết chuyện này. Nhét chủ đề vào `posts` là buộc mọi câu truy vấn bài đăng phải
 * nhớ loại trừ nó — và chỗ nào quên thì một chủ đề thảo luận hiện trên bản đồ Quanh Đây.
 *
 * ## KHÔNG có cột đếm bình luận hay cảm xúc trên chủ đề
 *
 * `posts.reaction_count` và `posts.comment_count` là bản sao của `content_reactions` và
 * `content_comments`, và chúng đã trôi. Ở đây hai bảng đó CÓ sẵn, nên đếm lúc đọc. Cùng lý
 * lẽ đã bỏ `recitation_count` ở phần A.
 *
 * ## Hồi hướng ở đây KHÁC Hồi hướng của Công đức
 *
 * §3.3.11 gọi Sổ vàng công đức là "Sổ vàng/Hồi hướng", và UC-DHARMA-04 cũng gọi là "Hồi
 * hướng". Hai thứ khác nhau dùng chung một từ:
 *
 * - `merit_declarations` (phần Công đức) = **số TIỀN** người dùng tự khai trước khi chuyển
 *   khoản.
 * - `dharma_dedications` (ở đây) = **lời** hồi hướng, gắn tên người được hồi hướng, có thể
 *   gắn với một lượt tụng kinh. Không có tiền ở đây.
 *
 * Ghi ra vì đây đúng loại chỗ hai người đọc cùng một từ rồi dựng hai thứ chồng nhau.
 */

/**
 * Trạng thái một chủ đề.
 *
 * Dùng ĐÚNG bốn giá trị của `content_comment_status_enum` để một màn kiểm duyệt đọc được cả
 * hai loại nội dung mà không phải nhớ hai bảng trạng thái.
 */
export const DharmaThreadStatuses = [
  'VISIBLE',
  'PENDING_REVIEW',
  'HIDDEN',
  'REMOVED',
] as const;

export type DharmaThreadStatus = (typeof DharmaThreadStatuses)[number];

/** Chủ đề đang hiện ra ngoài. `PENDING_REVIEW` KHÔNG hiện — nó chờ Admin. */
export const PubliclyVisibleThreadStatuses: readonly DharmaThreadStatus[] = [
  'VISIBLE',
];

export const MaxThreadTitleLength = 200;
export const MaxThreadBodyLength = 20_000;
export const MaxDedicationTextLength = 2_000;
export const MaxDedicateeNameLength = 200;

export function isPubliclyVisibleThread(status: DharmaThreadStatus): boolean {
  return PubliclyVisibleThreadStatuses.includes(status);
}

/**
 * Chủ đề này còn nhận bình luận không.
 *
 * Hai điều kiện, và `isLocked` là thứ UC-DHARMA-03 gọi là *"khóa bình luận"*: Admin đóng
 * phần bình luận mà KHÔNG ẩn chủ đề — một cuộc tranh luận chệch hướng vẫn đáng để đọc lại,
 * chỉ không nên tiếp tục.
 */
export function acceptsThreadComments(input: {
  readonly status: DharmaThreadStatus;
  readonly isLocked: boolean;
}): boolean {
  return isPubliclyVisibleThread(input.status) && !input.isLocked;
}

/** Những chỗ khiến một chủ đề KHÔNG tạo được. */
export function dharmaThreadGaps(input: {
  readonly title: string;
  readonly bodyText: string;
}): string[] {
  const gaps: string[] = [];

  if (input.title.trim().length < 5) gaps.push('title phải có ít nhất 5 ký tự');
  if (input.title.length > MaxThreadTitleLength)
    gaps.push(`title không vượt ${MaxThreadTitleLength} ký tự`);
  if (input.bodyText.trim().length < 10)
    gaps.push(
      'bodyText phải có ít nhất 10 ký tự — một chủ đề rỗng không ai trả lời được',
    );
  if (input.bodyText.length > MaxThreadBodyLength)
    gaps.push(`bodyText không vượt ${MaxThreadBodyLength} ký tự`);

  return gaps;
}

/** Những chỗ khiến một lời hồi hướng KHÔNG ghi được. */
export function dharmaDedicationGaps(input: {
  readonly text: string;
  readonly dedicateeName: unknown;
}): string[] {
  const gaps: string[] = [];

  if (input.text.trim().length < 5) gaps.push('text phải có ít nhất 5 ký tự');
  if (input.text.length > MaxDedicationTextLength)
    gaps.push(`text không vượt ${MaxDedicationTextLength} ký tự`);

  // `dedicateeName` TUỲ CHỌN: UC-DHARMA-04 cho *"tạo độc lập"*, và hồi hướng cho tất cả
  // chúng sinh là lời hồi hướng phổ biến nhất trong đạo Phật — nó không có tên người nhận.
  if (
    input.dedicateeName !== undefined &&
    input.dedicateeName !== null &&
    (typeof input.dedicateeName !== 'string' ||
      input.dedicateeName.trim().length === 0 ||
      input.dedicateeName.length > MaxDedicateeNameLength)
  )
    gaps.push(
      `dedicateeName nếu có gửi thì không được rỗng và không vượt ${MaxDedicateeNameLength} ký tự`,
    );

  return gaps;
}

/**
 * Tên hiện trên danh sách hồi hướng công khai.
 *
 * Trả chuỗi cố định khi ẩn danh — KHÔNG trả `null` để mỗi client tự chọn chữ thay thế, vì
 * hai client sẽ chọn hai chữ khác nhau cho cùng một hàng. Cùng lối `meritDonorLabel`.
 */
export const AnonymousDedicatorLabel = 'Người ẩn danh';

export function dedicatorLabel(displayName: string | null): string {
  return displayName?.trim() || AnonymousDedicatorLabel;
}
