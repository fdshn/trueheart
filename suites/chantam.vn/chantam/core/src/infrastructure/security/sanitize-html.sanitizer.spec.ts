import { SanitizeHtmlSanitizer } from './sanitize-html.sanitizer';

const sanitizer = new SanitizeHtmlSanitizer();

describe('SanitizeHtmlSanitizer — bộ ca tấn công', () => {
  /**
   * Mỗi dòng dưới đây là một kiểu XSS thật, không phải ca giả định.
   *
   * Thêm thẻ nào vào `allowedTags` thì phải thêm ca tương ứng ở đây **cùng ngày**. Danh
   * sách cho phép mà dài ra mà bộ ca này đứng im là cách chắc nhất để một thẻ lọt vào mà
   * không ai từng hỏi "thuộc tính nào của nó chạy mã được".
   */
  const attacks: Array<[string, string]> = [
    ['thẻ script', '<script>alert(1)</script>'],
    ['script kèm src ngoài', '<script src="https://evil.vn/x.js"></script>'],
    ['img onerror', '<img src="x" onerror="alert(1)">'],
    ['svg onload', '<svg onload="alert(1)"></svg>'],
    ['iframe', '<iframe src="https://evil.vn"></iframe>'],
    ['body onload', '<body onload="alert(1)">chữ</body>'],
    ['href javascript:', '<a href="javascript:alert(1)">bấm</a>'],
    [
      'href data: text/html',
      '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    ],
    ['img src data:', '<img src="data:text/html;base64,PHNjcmlwdD4=">'],
    [
      'style expression',
      '<div style="background:url(javascript:alert(1))">x</div>',
    ],
    ['thẻ style', '<style>body{display:none}</style>'],
    ['form + input', '<form action="https://evil.vn"><input name="pw"></form>'],
    ['object', '<object data="https://evil.vn/x.swf"></object>'],
    ['embed', '<embed src="https://evil.vn/x.swf">'],
    [
      'meta refresh',
      '<meta http-equiv="refresh" content="0;url=https://evil.vn">',
    ],
    ['onclick trên thẻ ĐƯỢC PHÉP', '<p onclick="alert(1)">chữ</p>'],
    [
      'onmouseover trên link được phép',
      '<a href="https://ok.vn" onmouseover="alert(1)">x</a>',
    ],
    ['thẻ không đóng bọc script', '<div><script>alert(1)'],
    ['chữ hoa lẫn lộn', '<ScRiPt>alert(1)</ScRiPt>'],
    [
      'script lồng trong noscript',
      '<noscript><script>alert(1)</script></noscript>',
    ],
    ['textarea chứa mã', '<textarea><script>alert(1)</script></textarea>'],
    [
      'srcset nhiều URL',
      '<img src="https://ok.vn/a.webp" srcset="https://evil.vn/x 2x">',
    ],
  ];

  for (const [label, payload] of attacks) {
    it(`chặn ${label}`, () => {
      const clean = sanitizer.sanitizeArticle(payload).toLowerCase();

      // Năm dấu hiệu, mỗi cái đủ để coi là lọt.
      expect(clean).not.toContain('<script');
      expect(clean).not.toContain('<iframe');
      expect(clean).not.toMatch(/\son[a-z]+\s*=/);
      expect(clean).not.toContain('javascript:');
      expect(clean).not.toContain('data:text/html');
      expect(clean).not.toContain('style=');
      expect(clean).not.toContain('srcset');
    });
  }

  it('nội dung của script và style bị BỎ, không in ra thành chữ', () => {
    expect(sanitizer.sanitizeArticle('<script>alert(1)</script>')).toBe('');
    expect(sanitizer.sanitizeArticle('<style>body{color:red}</style>')).toBe(
      '',
    );
  });

  it('giữ nguyên HTML hợp lệ của một bài viết thật', () => {
    const article =
      '<h2>Tâm từ</h2>' +
      '<p>Bố thí có <strong>ba bậc</strong>, và <em>tâm</em> quan trọng hơn vật.</p>' +
      '<ul><li>Tài thí</li><li>Pháp thí</li></ul>' +
      '<blockquote>Cho mà không mong nhận.</blockquote>' +
      '<figure><img src="https://cdn.chantam.vn/a.webp" alt="Sen"></figure>';
    const clean = sanitizer.sanitizeArticle(article);

    expect(clean).toContain('<h2>Tâm từ</h2>');
    expect(clean).toContain('<strong>ba bậc</strong>');
    expect(clean).toContain('<li>Tài thí</li>');
    expect(clean).toContain('<blockquote>');
    expect(clean).toContain('src="https://cdn.chantam.vn/a.webp"');
    expect(clean).toContain('alt="Sen"');
  });

  it('link https được giữ và BỊ BUỘC thêm rel noopener', () => {
    // Không tin người soạn gõ đúng: thiếu `noopener` thì trang đích đọc được
    // `window.opener` của app.
    const clean = sanitizer.sanitizeArticle(
      '<a href="https://chantam.vn">Chân Tâm</a>',
    );

    expect(clean).toContain('href="https://chantam.vn"');
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).toContain('target="_blank"');
  });

  it('người soạn tự đặt rel="" cũng bị ghi đè', () => {
    const clean = sanitizer.sanitizeArticle(
      '<a href="https://chantam.vn" rel="" target="_self">x</a>',
    );
    expect(clean).toContain('rel="noopener noreferrer"');
  });

  it('link http bị bỏ href nhưng chữ vẫn còn', () => {
    const clean = sanitizer.sanitizeArticle(
      '<a href="http://chantam.vn">Chân Tâm</a>',
    );

    expect(clean).not.toContain('http://');
    expect(clean).toContain('Chân Tâm');
  });

  it('đầu vào không phải chuỗi trả rỗng, không ném', () => {
    for (const raw of [null, undefined, 7, {}, []])
      expect(sanitizer.sanitizeArticle(raw)).toBe('');
  });

  it('lọc hai lần ra cùng kết quả — idempotent', () => {
    // Nếu không, bản lưu trong database và bản lọc lại sẽ khác nhau, và không ai biết
    // bản nào là bản đúng.
    const once = sanitizer.sanitizeArticle(
      '<p>Xin chào <b>bạn</b></p><script>x()</script><a href="https://a.vn">l</a>',
    );
    expect(sanitizer.sanitizeArticle(once)).toBe(once);
  });
});

describe('SanitizeHtmlSanitizer.textLength', () => {
  it('bài chỉ có thẻ rỗng đếm ra 0', () => {
    // `<p></p><p>&nbsp;</p>` là HTML hợp lệ, `length > 0`, và không có một chữ nào. Kiểm
    // "bài có nội dung" bằng độ dài chuỗi HTML sẽ cho một trang trắng xuất bản được.
    expect(sanitizer.textLength('<p></p><p>   </p>')).toBe(0);
    expect(sanitizer.textLength('<p>&nbsp;</p>')).toBe(0);
    expect(sanitizer.textLength('')).toBe(0);
  });

  it('đếm đúng chữ thật, không tính thẻ', () => {
    expect(sanitizer.textLength('<p>Xin <b>chào</b></p>')).toBe(
      'Xin chào'.length,
    );
  });

  it('bài toàn script lọc xong đếm ra 0', () => {
    const clean = sanitizer.sanitizeArticle('<script>alert(1)</script>');
    expect(sanitizer.textLength(clean)).toBe(0);
  });

  it('đầu vào không phải chuỗi trả 0', () => {
    expect(sanitizer.textLength(null as never)).toBe(0);
  });
});
