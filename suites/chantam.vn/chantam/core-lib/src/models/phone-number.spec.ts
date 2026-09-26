import { normalizePhoneNumber } from './phone-number';

describe('normalizePhoneNumber', () => {
  it.each([
    ['0912345678', '+84912345678'],
    ['+84912345678', '+84912345678'],
    ['84912345678', '+84912345678'],
    ['912345678', '+84912345678'],
    ['0912 345 678', '+84912345678'],
    ['(091) 234-5678', '+84912345678'],
    ['+84 912.345.678', '+84912345678'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizePhoneNumber(raw)).toBe(expected);
  });

  it('bốn cách gõ cùng một SIM ra CÙNG một chuỗi', () => {
    // Đây là toàn bộ lý do hàm này tồn tại: index UNIQUE so chuỗi, nên bốn cách
    // gõ khác nhau từng là bốn tài khoản hợp lệ cho cùng một số.
    const forms = ['0912345678', '+84912345678', '84912345678', '091 234 5678'];

    expect(new Set(forms.map((f) => normalizePhoneNumber(f))).size).toBe(1);
  });

  it.each([
    ['', 'chuỗi rỗng'],
    ['abc', 'chữ'],
    ['091234', 'quá ngắn'],
    ['09123456789012345678', 'quá dài'],
    ['+84-9a2-345678', 'lẫn chữ'],
  ])('từ chối %s (%s)', (raw) => {
    expect(normalizePhoneNumber(raw)).toBeNull();
  });

  it('null và undefined trả null, không ném', () => {
    expect(normalizePhoneNumber(null)).toBeNull();
    expect(normalizePhoneNumber(undefined)).toBeNull();
  });

  it('số quốc tế giữ nguyên mã nước của nó', () => {
    expect(normalizePhoneNumber('+6591234567')).toBe('+6591234567');
  });
});
