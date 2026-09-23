import { decodeKeysetCursor, encodeKeysetCursor } from './keyset-cursor';

describe('con trỏ tin nhắn', () => {
  const cursor = { createdAt: new Date('2026-09-22T03:04:05.678Z'), id: 4321 };

  it('mã hoá rồi giải mã ra đúng cặp ban đầu', () => {
    const decoded = decodeKeysetCursor(encodeKeysetCursor(cursor));

    expect(decoded?.createdAt.toISOString()).toBe(
      cursor.createdAt.toISOString(),
    );
    expect(decoded?.id).toBe(cursor.id);
  });

  it('giữ nguyên millisecond, không làm tròn về giây', () => {
    // Làm tròn về giây là mở lại đúng cái lỗi mà cặp (createdAt, id) sinh ra
    // để bịt: hai tin trong cùng một giây sẽ không phân định được.
    const decoded = decodeKeysetCursor(encodeKeysetCursor(cursor));

    expect(decoded?.createdAt.getMilliseconds()).toBe(678);
  });

  it('chuỗi đục, không lộ định dạng ra ngoài', () => {
    const encoded = encodeKeysetCursor(cursor);

    expect(encoded).not.toContain('4321');
    // base64url: an toàn trong query string, không cần escape.
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['rỗng', ''],
    ['undefined', undefined],
    ['null', null],
    ['rác không phải base64', '!!!'],
    ['thiếu dấu phân cách', Buffer.from('123').toString('base64url')],
    ['id không phải số', Buffer.from('123.abc').toString('base64url')],
    ['mốc không phải số', Buffer.from('abc.123').toString('base64url')],
    ['id âm', Buffer.from('123.-5').toString('base64url')],
    ['id bằng 0', Buffer.from('123.0').toString('base64url')],
    ['số thực', Buffer.from('123.5.7').toString('base64url')],
    [
      'vượt số nguyên an toàn',
      Buffer.from('123.99999999999999999999').toString('base64url'),
    ],
  ])('trả null chứ không ném lỗi khi con trỏ %s', (_label, value) => {
    expect(decodeKeysetCursor(value as string | undefined)).toBeNull();
  });

  it('không nhận Infinity dưới dạng chuỗi', () => {
    expect(
      decodeKeysetCursor(Buffer.from('Infinity.1').toString('base64url')),
    ).toBeNull();
  });
});
