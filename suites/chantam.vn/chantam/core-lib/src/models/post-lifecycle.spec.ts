import { PostTypes } from '../consts';
import {
  ExtensionWindowDays,
  PostLifetimeMonths,
  addMonthsClamped,
  expiryConvertsToOffer,
  postExpiryDate,
  postExpiryDateFor,
  selectionDeadlineFrom,
  usesSelectionLifecycle,
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

describe('vòng đời 7 + 30 ngày của CHỐT-10', () => {
  const publishedAt = new Date('2026-10-11T09:30:00.000Z');

  it('hạn xét là lúc đăng + 7 ngày, không phải lúc có phản hồi đầu tiên', () => {
    // Đây là cả nội dung của CHỐT-10 ở mục này: mốc tính từ LÚC ĐĂNG. Tới 06/10
    // nó tính từ phản hồi đầu tiên, nên bài không ai xin thì hạn là `null` vĩnh
    // viễn — không bao giờ tới hạn, không bao giờ vào giai đoạn mở rộng.
    expect(selectionDeadlineFrom(publishedAt).toISOString()).toBe(
      '2026-10-18T09:30:00.000Z',
    );
  });

  it('giữ nguyên giờ phút giây — hạn không bị kéo về nửa đêm', () => {
    // Kéo về đầu ngày là cho hoặc lấy đi tới gần một ngày so với điều đã hứa với
    // người đăng, tuỳ họ đăng lúc mấy giờ.
    const deadline = selectionDeadlineFrom(publishedAt);
    expect([
      deadline.getUTCHours(),
      deadline.getUTCMinutes(),
      deadline.getUTCSeconds(),
    ]).toEqual([9, 30, 0]);
  });

  it('OFFER hết hạn sau đúng 37 ngày = 7 xét + 30 mở rộng', () => {
    expect(postExpiryDateFor(PostTypes.OFFER, publishedAt).toISOString()).toBe(
      '2026-11-17T09:30:00.000Z',
    );
  });

  it('và mốc hết hạn ĐÚNG BẰNG hạn xét cộng 30 ngày', () => {
    // Giai đoạn mở rộng không có cột trạng thái riêng — nó CHÍNH LÀ khoảng giữa
    // hai cái mốc này. Nếu hai con số rời nhau thì "30 ngày mở rộng" thành một
    // lời hứa không ai kiểm được, và một cờ `IS_EXTENDED` sẽ được thêm vào để bù.
    expect(
      postExpiryDateFor(PostTypes.OFFER, publishedAt).getTime() -
        selectionDeadlineFrom(publishedAt).getTime(),
    ).toBe(ExtensionWindowDays * 24 * 60 * 60 * 1000);
  });

  it.each([PostTypes.WANTED, PostTypes.CLASSIFIED, PostTypes.CHARITY])(
    'loại %s giữ vòng đời ba tháng của CHỐT-05/07',
    (postType) => {
      expect(postExpiryDateFor(postType, publishedAt)).toEqual(
        postExpiryDate(publishedAt),
      );
    },
  );

  it('WANTED CHƯA vào vòng đời mới — và đó là chốt an toàn, không phải sót', () => {
    // CHỐT-10 muốn cả `WANTED`. Nhưng truy vấn tìm bài tới hạn không lọc
    // `post_type` và lấy `post.author_id AS giver_id` — với bài `WANTED` tác giả
    // là người muốn NHẬN, nên đặt hạn cho nó là để job dựng giao dịch với hai vai
    // ngược nhau. Phép kiểm này đỏ đúng lúc ai đó bật cờ mà chưa đảo vai.
    expect(usesSelectionLifecycle(PostTypes.WANTED)).toBe(false);
    expect(usesSelectionLifecycle(PostTypes.OFFER)).toBe(true);
  });

  it('không sửa vào Date được truyền vào', () => {
    const original = new Date('2026-10-11T09:30:00.000Z');
    selectionDeadlineFrom(original);
    postExpiryDateFor(PostTypes.OFFER, original);
    expect(original.toISOString()).toBe('2026-10-11T09:30:00.000Z');
  });
});
