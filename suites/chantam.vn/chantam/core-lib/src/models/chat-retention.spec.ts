import {
  chatPurgeDate,
  chatRetentionDays,
  ChatRetentionUnits,
  DefaultChatRetention,
  MaxChatRetentionDays,
  normalizeChatRetention,
} from './chat-retention';

describe('đọc cấu hình hạn lưu trữ chat', () => {
  it('nhận cấu hình theo tuần', () => {
    expect(normalizeChatRetention({ value: 3, unit: 'WEEK' })).toEqual({
      value: 3,
      unit: ChatRetentionUnits.WEEK,
    });
  });

  it('nhận cấu hình theo ngày', () => {
    expect(normalizeChatRetention({ value: 10, unit: 'DAY' })).toEqual({
      value: 10,
      unit: ChatRetentionUnits.DAY,
    });
  });

  it.each([
    ['null', null],
    ['chuỗi', 'một tuần'],
    ['thiếu đơn vị', { value: 3 }],
    ['đơn vị lạ', { value: 3, unit: 'MONTH' }],
    ['số không phải số', { value: 'ba', unit: 'WEEK' }],
    ['Infinity', { value: Number.POSITIVE_INFINITY, unit: 'DAY' }],
  ])('cấu hình %s rơi về mặc định thay vì ném lỗi', (_label, raw) => {
    // Cấu hình hỏng không được làm chết đường khoá phòng — khoá phòng là hệ quả
    // của một lượt trao vừa xong, hạn lưu trữ chỉ là chính sách dọn dẹp.
    expect(normalizeChatRetention(raw)).toEqual(DefaultChatRetention);
  });

  it('số nhỏ hơn 1 bị nâng lên 1, không thành 0 rồi xoá ngay lập tức', () => {
    expect(normalizeChatRetention({ value: 0, unit: 'DAY' }).value).toBe(1);
    expect(normalizeChatRetention({ value: -5, unit: 'WEEK' }).value).toBe(1);
  });

  it('chặn trên theo NGÀY quy đổi, không phải theo con số thô', () => {
    // 100 tuần là 700 ngày — phải bị chặn, dù 100 tự nó trông nhỏ.
    const capped = normalizeChatRetention({ value: 100, unit: 'WEEK' });

    expect(chatRetentionDays(capped)).toBeLessThanOrEqual(MaxChatRetentionDays);
  });

  it('cắt phần thập phân', () => {
    expect(normalizeChatRetention({ value: 2.9, unit: 'WEEK' }).value).toBe(2);
  });
});

describe('quy đổi ra ngày', () => {
  it('tuần thành ngày', () => {
    expect(chatRetentionDays({ value: 2, unit: ChatRetentionUnits.WEEK })).toBe(
      14,
    );
  });

  it('ngày giữ nguyên', () => {
    expect(chatRetentionDays({ value: 10, unit: ChatRetentionUnits.DAY })).toBe(
      10,
    );
  });
});

describe('thời điểm được phép xoá', () => {
  it('cộng đúng số ngày kể từ lúc KHOÁ phòng', () => {
    const locked = new Date('2026-09-22T10:00:00.000Z');

    expect(
      chatPurgeDate(locked, {
        value: 1,
        unit: ChatRetentionUnits.WEEK,
      }).toISOString(),
    ).toBe('2026-09-29T10:00:00.000Z');
  });

  it('không làm hỏng khi cộng qua ranh giới tháng', () => {
    const locked = new Date('2026-09-28T10:00:00.000Z');

    expect(
      chatPurgeDate(locked, {
        value: 1,
        unit: ChatRetentionUnits.WEEK,
      }).toISOString(),
    ).toBe('2026-10-05T10:00:00.000Z');
  });

  it('không đụng vào mốc khoá gốc', () => {
    const locked = new Date('2026-09-22T10:00:00.000Z');
    chatPurgeDate(locked, DefaultChatRetention);

    expect(locked.toISOString()).toBe('2026-09-22T10:00:00.000Z');
  });
});
