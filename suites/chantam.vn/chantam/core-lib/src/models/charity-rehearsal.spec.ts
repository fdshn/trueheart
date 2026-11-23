import {
  CharityRehearsalChecklistKeys,
  CharityRehearsalOutcomes,
  normalizeRehearsalChecklist,
} from './charity-rehearsal';

describe('tổng duyệt', () => {
  it('checklist luôn đủ 7 mục theo đúng thứ tự, mục thiếu là NOT_DONE', () => {
    const items = normalizeRehearsalChecklist([
      { key: 'TRANSPORT', status: 'DONE' },
    ]);
    expect(items).toHaveLength(7);
    expect(items.map((item) => item.key)).toEqual([
      ...CharityRehearsalChecklistKeys,
    ]);
    expect(items.find((item) => item.key === 'TRANSPORT')?.status).toBe('DONE');
    expect(
      items
        .filter((item) => item.key !== 'TRANSPORT')
        .every((item) => item.status === 'NOT_DONE' && item.note === null),
    ).toBe(true);
  });

  it('bỏ mục không biết và ghi chú rỗng', () => {
    const items = normalizeRehearsalChecklist([
      { key: 'UNKNOWN' as never, status: 'DONE' },
      { key: 'STAFF', status: 'NOT_DONE', note: '   ' },
    ]);
    expect(items).toHaveLength(7);
    expect(items.find((item) => item.key === 'STAFF')?.note).toBeNull();
  });

  it('kết quả tổng duyệt chỉ READY hoặc NOT_READY', () => {
    expect([...CharityRehearsalOutcomes]).toEqual(['READY', 'NOT_READY']);
  });
});
