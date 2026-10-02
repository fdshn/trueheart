import { DefaultAllocationPolicy } from '@chantam.vn/chantam.core-lib/models';
import {
  buildSmartMatchReasons,
  extractSmartMatchKeywords,
  scoreSmartMatch,
} from './smart-match.policy';

describe('extractSmartMatchKeywords', () => {
  it('tách từ và bỏ dấu câu', () => {
    expect(extractSmartMatchKeywords('Xe đạp cũ, còn tốt!')).toEqual([
      'xe',
      'đạp',
      'cũ',
      'còn',
      'tốt',
    ]);
  });

  it('giữ nguyên dấu tiếng Việt', () => {
    // Bỏ dấu thì "má" khớp với "mà", gợi ý sai hoàn toàn.
    expect(extractSmartMatchKeywords('Tủ lạnh')).toEqual(['tủ', 'lạnh']);
  });

  it('loại ký tự toán tử của tsquery', () => {
    // Token đi thẳng vào to_tsquery, ở đó & | ! : ( ) là toán tử. Để lọt là
    // câu truy vấn mang nghĩa khác, hoặc gãy giữa chừng.
    const keywords = extractSmartMatchKeywords('xe & đạp | (cũ) !hỏng');

    expect(keywords).toEqual(['xe', 'đạp', 'cũ', 'hỏng']);
    for (const keyword of keywords) expect(keyword).not.toMatch(/[&|!():*]/);
  });

  it('bỏ token một ký tự vì chúng khớp với gần như mọi bài', () => {
    expect(extractSmartMatchKeywords('o xe a')).toEqual(['xe']);
  });

  it('bỏ từ nối quá phổ biến', () => {
    expect(extractSmartMatchKeywords('áo của các bé')).toEqual(['áo', 'bé']);
  });

  it('không lặp lại token trùng', () => {
    expect(extractSmartMatchKeywords('xe xe XE')).toEqual(['xe']);
  });

  it('trả mảng rỗng khi không còn gì đáng tìm', () => {
    // Rỗng là tín hiệu để repository chỉ lọc theo danh mục, thay vì dựng một
    // tsquery rỗng làm Postgres báo lỗi cú pháp.
    expect(extractSmartMatchKeywords('và của các')).toEqual([]);
  });
});

describe('scoreSmartMatch', () => {
  const base = { distanceMeters: 0, radiusMeters: 1000 };

  it('khớp hoàn hảo sát bên được điểm tối đa 1', () => {
    expect(
      scoreSmartMatch({ ...base, sameCategory: true, keywordMatched: true }),
    ).toBeCloseTo(1);
  });

  it('cùng danh mục nặng hơn trùng từ khoá', () => {
    const category = scoreSmartMatch({
      ...base,
      sameCategory: true,
      keywordMatched: false,
      distanceMeters: 1000,
    });
    const keyword = scoreSmartMatch({
      ...base,
      sameCategory: false,
      keywordMatched: true,
      distanceMeters: 1000,
    });

    expect(category).toBeGreaterThan(keyword);
    expect(category).toBeCloseTo(DefaultAllocationPolicy.weights.sameCategory);
  });

  it('tới đúng rìa bán kính thì phần khoảng cách về 0', () => {
    expect(
      scoreSmartMatch({
        sameCategory: false,
        keywordMatched: false,
        distanceMeters: 1000,
        radiusMeters: 1000,
      }),
    ).toBe(0);
  });

  it('không bao giờ âm, kể cả khi khoảng cách vượt bán kính', () => {
    expect(
      scoreSmartMatch({
        sameCategory: false,
        keywordMatched: false,
        distanceMeters: 5000,
        radiusMeters: 1000,
      }),
    ).toBe(0);
  });

  it('bán kính 0 không làm chia cho 0', () => {
    expect(
      scoreSmartMatch({
        sameCategory: true,
        keywordMatched: false,
        distanceMeters: 0,
        radiusMeters: 0,
      }),
    ).toBeCloseTo(DefaultAllocationPolicy.weights.sameCategory);
  });
});

describe('buildSmartMatchReasons', () => {
  it('nêu đủ lý do để giao diện giải thích được', () => {
    // Gợi ý không giải thích được thì người dùng không có cơ sở đánh giá, mà
    // Smart Match chỉ được gợi ý chứ không quyết thay họ.
    expect(
      buildSmartMatchReasons({
        sameCategory: true,
        keywordMatched: true,
        distanceMeters: 100,
        radiusMeters: 1000,
      }),
    ).toEqual(['SAME_CATEGORY', 'KEYWORD_MATCH', 'NEARBY']);
  });

  it('không gắn NEARBY cho bài ở nửa ngoài bán kính', () => {
    expect(
      buildSmartMatchReasons({
        sameCategory: true,
        keywordMatched: false,
        distanceMeters: 900,
        radiusMeters: 1000,
      }),
    ).toEqual(['SAME_CATEGORY']);
  });
});
