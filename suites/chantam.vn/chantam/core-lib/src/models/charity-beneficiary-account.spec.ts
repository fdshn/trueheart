import {
  holderNameMatches,
  normalizeHolderName,
} from './charity-beneficiary-account';

describe('chuẩn hoá tên chủ tài khoản thụ hưởng', () => {
  it('bỏ dấu, chuẩn hoá đ, khoảng trắng và chữ hoa', () => {
    expect(normalizeHolderName('  NGUYỄN  Văn Đức ')).toBe('nguyen van duc');
    expect(normalizeHolderName('  NGUYỄN  Văn Đức ')).toBe(
      normalizeHolderName('NGUYEN VAN DUC'),
    );
  });

  it('so khớp tên ngân hàng không dấu với tên dự kiến có dấu', () => {
    expect(holderNameMatches('NGUYEN VAN DUC', 'Nguyễn Văn Đức')).toBe(true);
  });

  it.each([null, ''])('từ chối tên dự kiến trống: %p', (expected) => {
    expect(holderNameMatches('NGUYEN VAN DUC', expected)).toBe(false);
  });

  it('không so khớp tên khác nhau sau chuẩn hoá', () => {
    expect(holderNameMatches('TRAN THI B', 'Trần Thị Bé')).toBe(false);
  });

  it('giữ đ/Đ qua NFD rồi thay bằng d/D', () => {
    expect(normalizeHolderName('đ Đ')).toBe('d d');
  });
});
