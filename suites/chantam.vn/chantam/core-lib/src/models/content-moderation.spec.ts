import {
  joinIsolatedLetters,
  ModerationSeverities,
  ModerationVerdicts,
  normalizeBlockedTerms,
  normalizeForModeration,
  screenText,
} from './content-moderation';

const terms = normalizeBlockedTerms([
  'đm',
  'đụ má',
  { term: 'lừa đảo', severity: 'REVIEW' },
]);

describe('chuẩn hoá chữ trước khi so', () => {
  it('bỏ dấu tiếng Việt', () => {
    expect(normalizeForModeration('Đụ Má')).toBe('du ma');
  });

  it('map đ bằng tay — nó không phải d cộng dấu nên tách dấu Unicode bỏ sót', () => {
    // Thiếu bước này thì MỌI từ tiếng Việt bắt đầu bằng "đ" lọt lưới.
    expect(normalizeForModeration('Đường Đi')).toBe('duong di');
  });

  it('gom ký tự phân cách thành một dấu cách', () => {
    expect(normalizeForModeration('đ...m---m')).toBe('d m m');
  });

  it('rút chữ kéo dài về MỘT', () => {
    // Rút về hai thì "dmm" và "dm" vẫn khác nhau, tức chỉ cần gõ thêm một chữ
    // là luồn qua — đúng lỗi mà phiên bản đầu của hàm này mắc phải.
    expect(normalizeForModeration('đmmmmmm')).toBe('dm');
  });

  it('bỏ ký tự vô hình chèn giữa từ', () => {
    expect(normalizeForModeration('đ​m')).toBe('dm');
  });

  it('đổi chữ số và ký hiệu thay chữ cái', () => {
    expect(normalizeForModeration('l0z 4nh $au')).toBe('loz anh sau');
  });
});

describe('gộp chữ cái đứng lẻ', () => {
  it('gộp các chữ cái lẻ liền nhau', () => {
    expect(joinIsolatedLetters('d m may')).toBe('dm may');
  });

  it('KHÔNG gộp khi có từ dài xen giữa', () => {
    expect(joinIsolatedLetters('a xin b')).toBe('a xin b');
  });

  it('không đụng tới câu bình thường', () => {
    expect(joinIsolatedLetters('minh xin mon do nay')).toBe(
      'minh xin mon do nay',
    );
  });
});

describe('sàng nội dung', () => {
  it('cho qua câu bình thường', () => {
    const result = screenText('Mình xin món đồ này ạ, cảm ơn anh chị', terms);

    expect(result.verdict).toBe(ModerationVerdicts.ALLOW);
    expect(result.matched).toEqual([]);
  });

  it('chặn khi gõ thẳng', () => {
    expect(screenText('đm cái gì thế', terms).verdict).toBe(
      ModerationVerdicts.BLOCK,
    );
  });

  it.each([
    ['viết hoa', 'ĐM'],
    ['chấm giữa', 'đ.m'],
    ['cách giữa', 'đ m'],
    ['gạch giữa', 'đ-m'],
    ['kéo dài', 'đmmmm'],
    ['bỏ dấu', 'dm'],
    ['ký tự vô hình', 'đ​m'],
  ])('bắt được kiểu lách: %s', (_label, text) => {
    expect(screenText(`bạn ${text} thật`, terms).verdict).toBe(
      ModerationVerdicts.BLOCK,
    );
  });

  it('bắt được cụm nhiều từ bị rải dấu cách', () => {
    expect(screenText('đ ụ  m á mày', terms).verdict).toBe(
      ModerationVerdicts.BLOCK,
    );
  });

  it.each([
    ['admin', 'bạn hỏi admin nhé'],
    ['adm trong từ dài', 'phòng adminh'],
    ['âm thầm', 'mình âm thầm theo dõi bài này'],
  ])('KHÔNG bắt nhầm: %s', (_label, text) => {
    // Từ ngắn mà so chuỗi con trên dạng bỏ hết dấu cách là bắt nhầm hàng loạt.
    expect(screenText(text, terms).verdict).toBe(ModerationVerdicts.ALLOW);
  });

  it('mức REVIEW cho qua nhưng đánh dấu để Admin xem', () => {
    const result = screenText('cẩn thận kẻo lừa đảo đấy', terms);

    expect(result.verdict).toBe(ModerationVerdicts.REVIEW);
    expect(result.matched).toEqual(['lua dao']);
  });

  it('BLOCK thắng REVIEW khi dính cả hai', () => {
    expect(screenText('đm bọn lừa đảo', terms).verdict).toBe(
      ModerationVerdicts.BLOCK,
    );
  });

  it('nêu rõ đã khớp mục nào — Admin cần biết vì sao bị chặn', () => {
    expect(screenText('đm', terms).matched).toEqual(['dm']);
  });

  it('danh sách rỗng thì không chặn gì', () => {
    expect(screenText('đm đụ má lừa đảo', []).verdict).toBe(
      ModerationVerdicts.ALLOW,
    );
  });

  it('chữ rỗng không làm vỡ', () => {
    expect(screenText('   ', terms).verdict).toBe(ModerationVerdicts.ALLOW);
  });
});

describe('đọc cấu hình danh sách cấm', () => {
  it('nhận chuỗi trần, mặc định là BLOCK', () => {
    expect(normalizeBlockedTerms(['Đm'])).toEqual([
      { term: 'dm', severity: ModerationSeverities.BLOCK },
    ]);
  });

  it('nhận object có mức độ', () => {
    expect(
      normalizeBlockedTerms([{ term: 'lừa đảo', severity: 'REVIEW' }]),
    ).toEqual([{ term: 'lua dao', severity: ModerationSeverities.REVIEW }]);
  });

  it('bỏ trùng sau khi chuẩn hoá — "Đm" và "đ.m" là một', () => {
    expect(normalizeBlockedTerms(['Đm', 'đ.m'])).toHaveLength(1);
  });

  it.each([
    ['không phải mảng', { term: 'đm' }],
    ['null', null],
    ['chuỗi', 'đm'],
  ])('cấu hình %s trả danh sách RỖNG, không chặn gì', (_label, raw) => {
    // Cố ý không "an toàn là chặn hết": một dòng JSON gõ nhầm không được biến
    // thành chặn mọi bình luận, vì không ai nối được lỗi đó với ô cấu hình.
    expect(normalizeBlockedTerms(raw)).toEqual([]);
  });

  it('bỏ qua mục rác nhưng giữ mục hợp lệ còn lại', () => {
    expect(normalizeBlockedTerms([null, 123, { term: 'đm' }, ''])).toEqual([
      { term: 'dm', severity: ModerationSeverities.BLOCK },
    ]);
  });
});
