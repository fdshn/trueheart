import {
  IBlockedTerm,
  joinIsolatedLetters,
  ModerationSeverities,
  ModerationVerdicts,
  normalizeBlockedTerms,
  normalizeForModeration,
  screenText,
} from './content-moderation';
import {
  AbusiveModerationCorpus,
  InnocentModerationCorpus,
} from './content-moderation.corpus';

/**
 * Corpus canh cái mà spec cũ của `screenText` không canh được.
 *
 * Spec cũ TRUYỀN danh sách từ vào rồi kiểm bộ so khớp — đúng việc của nó. Nhưng
 * không phép kiểm nào hỏi "một mục cụ thể có bắt nhầm câu người ta hay viết
 * không", và đó là câu hỏi quyết định danh sách nào dùng được.
 */
const Seeded: readonly (readonly [string, 'BLOCK' | 'REVIEW'])[] = [
  ['đm', 'BLOCK'],
  ['đcm', 'BLOCK'],
  ['vcl', 'BLOCK'],
  ['vkl', 'BLOCK'],
  ['clm', 'BLOCK'],
  ['cmn', 'BLOCK'],
  ['thằng chó', 'BLOCK'],
  ['chó chết', 'BLOCK'],
  ['đồ khốn', 'BLOCK'],
  ['khốn nạn', 'BLOCK'],
  ['mẹ mày', 'BLOCK'],
  ['bố mày', 'BLOCK'],
  ['địt mẹ', 'BLOCK'],
  ['đĩ thoã', 'BLOCK'],
  ['mất dạy', 'BLOCK'],
  ['vô học', 'BLOCK'],
  ['rác rưởi', 'BLOCK'],
  ['óc lợn', 'BLOCK'],
  ['đồ súc vật', 'BLOCK'],
  ['thằng súc vật', 'BLOCK'],
  ['cút đi', 'REVIEW'],
  ['im đi', 'REVIEW'],
  ['thằng điên', 'REVIEW'],
  ['chuyển khoản trước', 'REVIEW'],
  ['đặt cọc', 'REVIEW'],
  ['cọc trước', 'REVIEW'],
  ['phí vận chuyển', 'REVIEW'],
  ['phí giữ hàng', 'REVIEW'],
  ['chuyển tiền', 'REVIEW'],
  ['số tài khoản', 'REVIEW'],
  ['momo', 'REVIEW'],
  ['thẻ cào', 'REVIEW'],
  ['nạp thẻ', 'REVIEW'],
  ['otp', 'REVIEW'],
  ['mã otp', 'REVIEW'],
  ['vay tiền', 'REVIEW'],
  ['lãi suất', 'REVIEW'],
  ['ship cod', 'REVIEW'],
  ['zalo riêng', 'REVIEW'],
  ['nhắn zalo', 'REVIEW'],
  ['kết bạn zalo', 'REVIEW'],
  ['inbox riêng', 'REVIEW'],
  ['liên hệ ngoài', 'REVIEW'],
  ['telegram', 'REVIEW'],
  ['kết bạn facebook', 'REVIEW'],
  ['số điện thoại riêng', 'REVIEW'],
  ['thuốc lá', 'REVIEW'],
  ['rượu', 'REVIEW'],
  ['vũ khí', 'REVIEW'],
  ['dao găm', 'REVIEW'],
  ['khẩu súng', 'REVIEW'],
  ['súng ngắn', 'REVIEW'],
  ['súng hơi', 'REVIEW'],
  ['súng săn', 'REVIEW'],
  ['ma túy', 'REVIEW'],
  ['cần sa', 'REVIEW'],
  ['pháo nổ', 'REVIEW'],
  ['động vật hoang dã', 'REVIEW'],
  ['thuốc kê đơn', 'REVIEW'],
  ['nội tạng', 'REVIEW'],
  ['chất kích thích', 'REVIEW'],
  ['thực phẩm hết hạn', 'REVIEW'],
  ['bán lại', 'REVIEW'],
  ['thanh lý', 'REVIEW'],
  ['cần bán', 'REVIEW'],
  ['bán gấp', 'REVIEW'],
];

const SeededTerms: readonly IBlockedTerm[] = Seeded.map(([term, severity]) => ({
  term,
  severity: severity as ModerationSeverities,
}));

const terms = normalizeBlockedTerms(SeededTerms);

describe('Danh sách từ ngữ đã seed', () => {
  it('KHÔNG bắt nhầm câu vô hại nào', () => {
    // Một dương tính giả ở mức BLOCK là người dùng không đăng được và không hiểu
    // vì sao. Ở mức REVIEW là hàng đợi Admin đầy rác — rồi họ duyệt qua cho
    // nhanh, và bộ lọc mất tác dụng theo cách không ai đo được.
    const caught = InnocentModerationCorpus.filter(
      (sentence) =>
        screenText(sentence, terms).verdict !== ModerationVerdicts.ALLOW,
    ).map((sentence) => {
      const { verdict, matched } = screenText(sentence, terms);

      return `${verdict} [${matched.join(', ')}] cho "${sentence}"`;
    });

    expect(caught).toEqual([]);
  });

  it('không mục nào là mục CHẾT', () => {
    // Một mục không bắt được câu xấu nào thì không làm gì, mà trông y như một mục
    // đang bảo vệ điều gì đó — đúng họ lỗi với khoá cấu hình không ai đọc.
    const dead = terms
      .filter(
        (term) =>
          !AbusiveModerationCorpus.some(
            (sentence) =>
              screenText(sentence, [term]).verdict !== ModerationVerdicts.ALLOW,
          ),
      )
      .map((term) => term.term);

    expect(dead).toEqual([]);
  });

  it('không câu xấu nào lọt lưới', () => {
    const missed = AbusiveModerationCorpus.filter(
      (sentence) =>
        screenText(sentence, terms).verdict === ModerationVerdicts.ALLOW,
    );

    expect(missed).toEqual([]);
  });

  it('không mục nào TRÙNG mục khác sau chuẩn hoá', () => {
    // Bản seed đầu khai 41 mục mà chỉ 38 có hiệu lực: `đm`, `đmm`, `dmm` cùng ra
    // `dm` vì bộ chuẩn hoá rút chữ lặp về một chữ. Ba dòng vô ích, và người đọc
    // danh sách tưởng ba biến thể đang được canh riêng.
    expect(terms.length).toBe(SeededTerms.length);
  });

  it('mọi mục BLOCK là xúc phạm trực diện, không phải dấu hiệu cần xem', () => {
    // BLOCK nghĩa là người dùng KHÔNG đăng được, nên ngưỡng phải cao. Dấu hiệu
    // lừa đảo và hàng cấm phải là REVIEW: "đặt cọc" có thể là câu hỏi giao nhận
    // thật thà, chặn thẳng là chặn cả người hỏi thật.
    const blocked = terms
      .filter((term) => term.severity === ModerationSeverities.BLOCK)
      .map((term) => term.term);

    for (const signal of [
      'dat coc',
      'chuyen tien',
      'momo',
      'telegram',
      'thuoc la',
    ])
      expect(blocked).not.toContain(signal);
  });

  it('từ tục nặng nhất KHÔNG thêm được — chúng trùng từ thường gặp', () => {
    // Đây là giới hạn của bộ so khớp, không phải chỗ bỏ sót của danh sách. Phép
    // kiểm này tồn tại để lần sau ai định "bổ sung cho đủ" thì thấy ngay hậu quả.
    const collisions: readonly (readonly [string, string])[] = [
      ['cặc', 'các bạn ơi mình còn bộ sách này'],
      ['lồn', 'còn hai lon sữa bột cho bé'],
      ['buồi', 'buổi sáng mình có nhà, buổi chiều đi làm'],
      ['đĩ', 'con đi học xa nên để lại cái bàn'],
      ['địt', 'cái đít nồi hơi móp nhưng vẫn dùng được'],
    ];

    for (const [profanity, innocent] of collisions) {
      const [normalized] = normalizeBlockedTerms([
        { term: profanity, severity: ModerationSeverities.BLOCK },
      ]);

      // Thêm vào là chặn luôn câu vô hại bên cạnh…
      expect(screenText(innocent, [normalized]).verdict).toBe(
        ModerationVerdicts.BLOCK,
      );
      // …nên nó phải KHÔNG nằm trong danh sách.
      expect(terms.map((term) => term.term)).not.toContain(normalized.term);
    }
  });

  it('corpus đủ lớn để phép kiểm có nghĩa', () => {
    // Một corpus rỗng làm mọi khẳng định trên đây xanh mà không chứng minh gì.
    expect(InnocentModerationCorpus.length).toBeGreaterThanOrEqual(30);
    expect(AbusiveModerationCorpus.length).toBeGreaterThanOrEqual(60);
    // Ba dạng của cùng một chuỗi. Ví dụ trong docstring của `content-moderation`
    // từng ghi `d mm may` — sai kể từ lúc phép rút chữ lặp đổi sang rút về MỘT
    // chữ, và không phép kiểm nào khẳng định nên nó nằm sai suốt.
    const spaced = normalizeForModeration('Đ.Mmmm  mày');
    expect(spaced).toBe('d m may');
    expect(joinIsolatedLetters(spaced)).toBe('dm may');
    expect(spaced.replace(/ /g, '')).toBe('dmmay');
  });
});
