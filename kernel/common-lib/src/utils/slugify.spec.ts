import { slugify } from './slugify';

describe('slugify', () => {
  it('bỏ dấu tiếng Việt', () => {
    expect(slugify('Xe đạp cũ còn tốt')).toBe('xe-dap-cu-con-tot');
  });

  it('xử lý chữ đ hoa và thường', () => {
    expect(slugify('Đồ Dùng Học Tập')).toBe('do-dung-hoc-tap');
  });

  it('gộp ký tự đặc biệt thành một dấu gạch và cắt hai đầu', () => {
    expect(slugify('  Sách  ---  Giáo   Khoa!!! ')).toBe('sach-giao-khoa');
  });

  it('cắt theo độ dài tối đa', () => {
    expect(slugify('a'.repeat(200), 10)).toHaveLength(10);
  });
});
