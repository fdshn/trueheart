import { PostTypes } from '../consts';
import {
  PostLifetimeMonths,
  addMonthsClamped,
  expiryConvertsToOffer,
  postExpiryDate,
} from './post-lifecycle';

describe('addMonthsClamped', () => {
  it('cộng tháng như bình thường khi ngày vẫn tồn tại ở tháng đích', () => {
    expect(addMonthsClamped(new Date(2026, 0, 15), 3)).toEqual(
      new Date(2026, 3, 15),
    );
  });

  it('kẹp về ngày cuối tháng thay vì tràn sang tháng sau', () => {
    // 30/11 + 3 tháng = 30/02 — một ngày không tồn tại. `setMonth` trần sẽ
    // đẩy thành 02/03, tức bài hết hạn sớm hai ngày so với điều đã hứa.
    expect(addMonthsClamped(new Date(2026, 10, 30), 3)).toEqual(
      new Date(2027, 1, 28),
    );
  });

  it('kẹp đúng vào năm nhuận', () => {
    expect(addMonthsClamped(new Date(2027, 10, 30), 3)).toEqual(
      new Date(2028, 1, 29),
    );
  });

  it('31/05 + 3 tháng ra 31/08 chứ không lùi', () => {
    expect(addMonthsClamped(new Date(2026, 4, 31), 3)).toEqual(
      new Date(2026, 7, 31),
    );
  });

  it('giữ nguyên giờ phút giây', () => {
    const from = new Date(2026, 0, 31, 13, 45, 30, 123);
    const result = addMonthsClamped(from, 1);

    expect(result.getDate()).toBe(28);
    expect(result.getHours()).toBe(13);
    expect(result.getMinutes()).toBe(45);
    expect(result.getSeconds()).toBe(30);
    expect(result.getMilliseconds()).toBe(123);
  });

  it('không sửa vào Date được truyền vào', () => {
    const from = new Date(2026, 0, 15);
    addMonthsClamped(from, 3);

    expect(from).toEqual(new Date(2026, 0, 15));
  });
});

describe('postExpiryDate', () => {
  it('cách lúc duyệt đúng số tháng đã quy định', () => {
    expect(postExpiryDate(new Date(2026, 0, 15))).toEqual(
      addMonthsClamped(new Date(2026, 0, 15), PostLifetimeMonths),
    );
  });
});

describe('expiryConvertsToOffer', () => {
  it('chỉ tin rao vặt mới chuyển thành Muốn Tặng khi hết hạn', () => {
    expect(expiryConvertsToOffer(PostTypes.CLASSIFIED)).toBe(true);
  });

  it.each([
    PostTypes.OFFER,
    PostTypes.WANTED,
    PostTypes.CHARITY,
    PostTypes.MERIT,
  ])('%s thì hết hạn là hết hạn', (postType) => {
    expect(expiryConvertsToOffer(postType)).toBe(false);
  });
});
