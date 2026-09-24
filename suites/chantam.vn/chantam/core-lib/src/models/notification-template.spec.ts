import {
  renderNotificationTemplate,
  templatePlaceholders,
} from './notification-template';

describe('renderNotificationTemplate', () => {
  it('thay chỗ trống bằng giá trị', () => {
    expect(
      renderNotificationTemplate('Chào {ten}, bạn có {so} tin mới', {
        ten: 'An',
        so: '3',
      }),
    ).toBe('Chào An, bạn có 3 tin mới');
  });

  it('thiếu giá trị thì GIỮ NGUYÊN chỗ trống, không xoá đi', () => {
    // Một thông báo hiện ra {ten} là lỗi nhìn thấy ngay; một câu cụt giữa
    // chừng trông như nội dung thật và sống sót rất lâu.
    expect(renderNotificationTemplate('Chào {ten} nhé', {})).toBe(
      'Chào {ten} nhé',
    );
  });

  it('không thay đệ quy — giá trị chứa chỗ trống không bị thay tiếp', () => {
    // Nếu không, một biến do người dùng nhập có thể kéo theo biến khác.
    expect(renderNotificationTemplate('{a}', { a: '{b}', b: 'bí mật' })).toBe(
      '{b}',
    );
  });

  it('thay mọi lần xuất hiện của cùng một chỗ trống', () => {
    expect(renderNotificationTemplate('{x} và {x}', { x: 'A' })).toBe('A và A');
  });

  it('bỏ qua thứ trông giống chỗ trống nhưng không phải', () => {
    expect(renderNotificationTemplate('giá {100.000}đ', { x: 'A' })).toBe(
      'giá {100.000}đ',
    );
  });

  it('mẫu không có chỗ trống thì trả nguyên văn', () => {
    expect(renderNotificationTemplate('Bạn có tin nhắn mới')).toBe(
      'Bạn có tin nhắn mới',
    );
  });

  it('giá trị rỗng vẫn là một giá trị, không phải thiếu', () => {
    expect(renderNotificationTemplate('A{x}B', { x: '' })).toBe('AB');
  });
});

describe('templatePlaceholders', () => {
  it('liệt kê chỗ trống, không trùng lặp', () => {
    expect(templatePlaceholders('{a} {b} {a}')).toEqual(['a', 'b']);
  });

  it('mẫu không có chỗ trống trả mảng rỗng', () => {
    expect(templatePlaceholders('không có gì')).toEqual([]);
  });
});
