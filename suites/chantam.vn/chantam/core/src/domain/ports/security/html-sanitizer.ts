/**
 * Bộ lọc HTML cho nội dung Rich Text (SRS §6.2.12, UC-BLOG-01).
 *
 * `blogs.content_html` là ô duy nhất trong cả hệ nhận HTML thô do người soạn gõ rồi giao
 * thẳng cho client dựng. Đặc tả ghi rõ cột này phải được chống XSS.
 *
 * Là PORT chứ không phải hàm thuần trong `core-lib` vì hiện thực của nó cần một bộ parse
 * HTML thật (`sanitize-html` → `htmlparser2`), và `core-lib` theo invariant 7 là contract
 * mà Next.js web/admin sẽ import trực tiếp — kéo một parser phía server vào bundle trình
 * duyệt là cái giá không đáng.
 */
export interface IHtmlSanitizer {
  /**
   * Trả HTML đã lọc theo danh sách thẻ cho phép.
   *
   * **Phải idempotent**: lọc hai lần ra cùng kết quả. Nếu không thì bản lưu trong database
   * và bản lọc lại sẽ khác nhau, và không ai biết bản nào là bản đúng.
   *
   * Đầu vào không phải chuỗi trả chuỗi rỗng, không ném — bên gọi kiểm "rỗng" bằng
   * `blogGaps`.
   */
  sanitizeArticle(raw: unknown): string;
  /**
   * Số ký tự CHỮ còn lại sau khi bỏ hết thẻ.
   *
   * Tồn tại riêng vì `<p></p><p>&nbsp;</p>` là HTML hợp lệ, `length > 0`, và không có một
   * chữ nào. Kiểm "bài có nội dung" bằng độ dài chuỗi HTML sẽ cho một bài trắng xuất bản
   * được.
   */
  textLength(html: string): number;
}

export const IHtmlSanitizer = Symbol('IHtmlSanitizer');
