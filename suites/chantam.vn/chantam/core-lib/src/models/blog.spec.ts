import {
  BlogCategories,
  BlogCategoryLabels,
  blogGaps,
  isBlogThumbnailUrl,
  normalizeBlogSlug,
  normalizeBlogSummary,
  slugifyBlogTitle,
} from './blog';

describe('slugifyBlogTitle', () => {
  it('bỏ dấu tiếng Việt', () => {
    expect(slugifyBlogTitle('Tâm Từ Và Hạnh Bố Thí')).toBe(
      'tam-tu-va-hanh-bo-thi',
    );
  });

  it('xử lý được chữ đ — NFD không tách được nó', () => {
    // `đ` là một chữ riêng trong Unicode, không phải `d` cộng dấu. Không đổi trước thì
    // "Đồ Dùng" ra "o-dung".
    expect(slugifyBlogTitle('Đồ Dùng Cho Bé')).toBe('do-dung-cho-be');
    expect(slugifyBlogTitle('ĐẠI ĐỨC')).toBe('dai-duc');
  });

  it('gộp ký tự lạ thành một gạch và cắt gạch ở hai đầu', () => {
    expect(slugifyBlogTitle('  Vu Lan — Báo Hiếu!!! 2026  ')).toBe(
      'vu-lan-bao-hieu-2026',
    );
  });

  it('tiêu đề toàn ký tự ngoài Latin ra slug RỖNG', () => {
    // Phải trả rỗng để bên gọi thấy và tự gắn hậu tố: cột `UNIQUE NOT NULL` nên bài thứ
    // hai như vậy sẽ đụng khoá.
    expect(slugifyBlogTitle('観音菩薩')).toBe('');
    expect(slugifyBlogTitle('🙏🪷')).toBe('');
  });

  it('normalizeBlogSlug chuẩn hoá y hệt — không có hai cách viết cho một đường', () => {
    expect(normalizeBlogSlug('Đồ Dùng Cho Bé')).toBe('do-dung-cho-be');
    expect(normalizeBlogSlug(null)).toBe('');
  });
});

describe('normalizeBlogSummary', () => {
  it('chuỗi trắng thành null, không thành rỗng', () => {
    expect(normalizeBlogSummary('   ')).toBeNull();
    expect(normalizeBlogSummary(null)).toBeNull();
    expect(normalizeBlogSummary('  Tóm tắt  ')).toBe('Tóm tắt');
  });
});

describe('isBlogThumbnailUrl', () => {
  it('chỉ nhận https', () => {
    expect(isBlogThumbnailUrl('https://cdn.chantam.vn/a.webp')).toBe(true);
    expect(isBlogThumbnailUrl('http://cdn.chantam.vn/a.webp')).toBe(false);
    expect(isBlogThumbnailUrl('a.webp')).toBe(false);
    expect(isBlogThumbnailUrl(null)).toBe(false);
  });
});

describe('blogGaps', () => {
  const draft = {
    isPublished: false,
    title: 'Tâm Từ',
    slug: 'tam-tu',
    contentTextLength: 0,
    thumbnailUrl: null,
  };

  it('bản nháp thiếu nội dung và ảnh bìa vẫn lưu được', () => {
    expect(blogGaps(draft)).toEqual([]);
  });

  it('tiêu đề quá ngắn bị chặn kể cả khi còn nháp', () => {
    expect(blogGaps({ ...draft, title: 'Ta' })).toContain(
      'title phải có ít nhất 3 ký tự',
    );
  });

  it('slug rỗng bị chặn kể cả khi còn nháp — cột UNIQUE NOT NULL', () => {
    const gaps = blogGaps({ ...draft, slug: '' });
    expect(gaps.some((g) => g.startsWith('slug rỗng'))).toBe(true);
  });

  it('xuất bản mà nội dung lọc xong không còn chữ nào thì bị chặn', () => {
    // `contentTextLength: 0` là kết quả của cả hai ca thật: bài chỉ có `<p></p>`, và bài
    // dán toàn `<script>` nên lọc xong là rỗng. Nếu chỉ kiểm "đã gửi contentHtml chưa"
    // thì cả hai đều xuất bản được dưới dạng một trang trắng.
    const gaps = blogGaps({
      ...draft,
      isPublished: true,
      contentTextLength: 0,
      thumbnailUrl: 'https://cdn.chantam.vn/a.webp',
    });
    expect(gaps).toEqual([
      'contentHtml không còn nội dung nào sau khi lọc HTML',
    ]);
  });

  it('xuất bản mà thiếu ảnh bìa https thì bị chặn', () => {
    const gaps = blogGaps({
      ...draft,
      isPublished: true,
      contentTextLength: 12,
      thumbnailUrl: 'http://cdn.chantam.vn/a.webp',
    });
    expect(gaps).toContain(
      'thumbnailUrl phải là một đường dẫn https khi xuất bản',
    );
  });

  it('bài đủ điều kiện thì không còn gap', () => {
    expect(
      blogGaps({
        isPublished: true,
        title: 'Tâm Từ Và Hạnh Bố Thí',
        slug: 'tam-tu-va-hanh-bo-thi',
        contentTextLength: 18,
        thumbnailUrl: 'https://cdn.chantam.vn/a.webp',
      }),
    ).toEqual([]);
  });
});

describe('BlogCategories', () => {
  it('bốn chuyên mục của UC-BLOG-01 đều có nhãn', () => {
    expect(BlogCategories).toHaveLength(4);
    for (const category of BlogCategories)
      expect(BlogCategoryLabels[category].length).toBeGreaterThan(0);
  });
});
