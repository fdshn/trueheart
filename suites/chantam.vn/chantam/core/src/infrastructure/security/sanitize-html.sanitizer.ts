import { IHtmlSanitizer } from '@/domain/ports/security';
import { MaxBlogContentLength } from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import * as sanitizeHtml from 'sanitize-html';

/**
 * Hiện thực `IHtmlSanitizer` bằng `sanitize-html`.
 *
 * ## `import * as`, KHÔNG phải default import
 *
 * `sanitize-html` khai `export = sanitize`. `tsconfig.json` của service bật
 * `allowSyntheticDefaultImports` mà **không** bật `esModuleInterop`, nên
 * `import sanitizeHtml from 'sanitize-html'` qua được type-check nhưng JS phát ra là
 * `sanitize_html_1.default(...)` — tức `undefined` lúc chạy. Build xanh, type xanh, và
 * `sanitizeHtml.simpleTransform` nổ ở request đầu tiên có ai lưu bài viết.
 *
 * Đó là bẫy cho MỌI gói `export =` thêm vào service sau này. Lối đúng trong repo này là
 * `import * as`, giống `import * as Joi from 'joi'` ở `config.schema.ts`.
 *
 * ## Danh sách cho phép cố tình ngắn
 *
 * Rich Text của một bài giảng Phật pháp cần đoạn văn, tiêu đề, in đậm, danh sách, trích
 * dẫn, ảnh và liên kết. Không cần `<table>`, `<iframe>`, `<video>`, `<style>`, `<form>`.
 * Mỗi thẻ thêm vào là một bề mặt phải tự hỏi lại *"thuộc tính nào của nó chạy mã được"*,
 * nên danh sách này chỉ dài ra cùng một ca kiểm tấn công tương ứng.
 *
 * ## Bốn quyết định trong cấu hình
 *
 * 1. `allowedSchemes` chỉ `https` — không `http` (iOS chặn, ra khung trắng), không `data:`
 *    (một `data:text/html` trong `href` là XSS), không `javascript:`.
 * 2. **Không** thuộc tính `style`. Một `style` tự do cho phép `position:fixed` phủ kín màn
 *    hình, hoặc `background:url(...)` gọi ra ngoài. Giao diện bài viết là việc của client.
 * 3. `a` bị **buộc** `rel="noopener noreferrer"` và `target="_blank"` qua `transformTags` —
 *    không tin người soạn gõ đúng. Thiếu `noopener` thì trang đích đọc được `window.opener`.
 * 4. `img` chỉ nhận `src`/`alt`/`width`/`height`. Không `srcset`: đó là một danh sách URL
 *    nữa phải lọc riêng, và bài viết không cần nó.
 *
 * ## Lọc ở tầng GHI
 *
 * Use case lọc trước khi ghi, và cột lưu bản đã sạch. Nhờ vậy một đường đọc quên lọc cũng
 * không làm lộ gì, và một bài dài không trả giá lọc lại mỗi lượt xem. Cái giá: một dòng
 * chèn bằng SQL tay không đi qua đây — đúng lỗ mà mọi bảng khác trong repo cũng có, nên
 * `test:blog` đo nội dung ĐÃ LƯU trong database chứ không đo giá trị trả về của hàm này.
 */
const ArticleOptions: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'h2',
    'h3',
    'h4',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'blockquote',
    'ul',
    'ol',
    'li',
    'a',
    'img',
    'figure',
    'figcaption',
    'hr',
    'code',
    'pre',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
  },
  allowedSchemes: ['https'],
  allowedSchemesByTag: { img: ['https'], a: ['https'] },
  // Thẻ ngoài danh sách thì bỏ THẺ mà giữ CHỮ bên trong — trừ nhóm dưới đây, nơi phần
  // "chữ bên trong" chính là mã. Giữ nội dung một `<script>` nghĩa là in nguyên đoạn
  // JavaScript ra giữa bài viết: vô hại về bảo mật nhưng là rác, và làm người đọc tưởng
  // bộ lọc hỏng.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe'],
  disallowedTagsMode: 'discard',
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', {
      rel: 'noopener noreferrer',
      target: '_blank',
    }),
  },
};

const TextOnlyOptions: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
};

@Injectable()
export class SanitizeHtmlSanitizer implements IHtmlSanitizer {
  public sanitizeArticle(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    return sanitizeHtml(raw, ArticleOptions).slice(0, MaxBlogContentLength);
  }

  public textLength(html: string): number {
    if (typeof html !== 'string') return 0;
    return sanitizeHtml(html, TextOnlyOptions)
      .replace(/&nbsp;/g, ' ')
      .trim().length;
  }
}
