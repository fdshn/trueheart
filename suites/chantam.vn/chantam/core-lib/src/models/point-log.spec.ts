import { formatPointLogNote } from './point-log';

describe('formatPointLogNote', () => {
  it('nói rõ đang âm bao nhiêu khi khoản phạt vượt số dư', () => {
    // Đúng ví dụ nghiệp vụ: đang có 20, bị phạt 50.
    expect(formatPointLogNote(-50, -30)).toBe('-50 điểm, đang âm 30 điểm');
  });

  it('khoản cộng có dấu + để phân biệt với khoản trừ', () => {
    expect(formatPointLogNote(28, 28)).toBe('+28 điểm, còn 28 điểm');
  });

  it('khoản trừ chưa chạm đáy thì nói "còn", không nói "âm"', () => {
    expect(formatPointLogNote(-10, 18)).toBe('-10 điểm, còn 18 điểm');
  });

  it('về đúng 0 là "còn 0", không phải "đang âm 0"', () => {
    expect(formatPointLogNote(-20, 0)).toBe('-20 điểm, còn 0 điểm');
  });

  it('cộng để trả hết nợ thì hiện phần dương còn lại', () => {
    // Đang âm 30, được cộng 50.
    expect(formatPointLogNote(50, 20)).toBe('+50 điểm, còn 20 điểm');
  });

  it('cộng mà vẫn chưa hết nợ thì vẫn là đang âm', () => {
    expect(formatPointLogNote(10, -20)).toBe('+10 điểm, đang âm 20 điểm');
  });
});
