import {
  clampChatMessageLimit,
  DefaultChatMessageLimit,
  MaxChatMessageLimit,
} from './chat-cursor';

describe('trần số tin mỗi lần lấy', () => {
  it('không truyền thì dùng mặc định', () => {
    expect(clampChatMessageLimit(undefined)).toBe(DefaultChatMessageLimit);
  });

  it('chặn ở trần, đây là thứ giữ cho một phòng lớn không kéo hết về máy', () => {
    expect(clampChatMessageLimit(999999)).toBe(MaxChatMessageLimit);
  });

  it('số nhỏ hơn 1 bị nâng lên 1, không thành 0 rồi trả mảng rỗng mãi', () => {
    expect(clampChatMessageLimit(0)).toBe(1);
    expect(clampChatMessageLimit(-10)).toBe(1);
  });

  it('cắt phần thập phân thay vì đưa số thực vào LIMIT', () => {
    expect(clampChatMessageLimit(10.9)).toBe(10);
  });

  it('NaN rơi về mặc định', () => {
    expect(clampChatMessageLimit(Number.NaN)).toBe(DefaultChatMessageLimit);
  });
});
