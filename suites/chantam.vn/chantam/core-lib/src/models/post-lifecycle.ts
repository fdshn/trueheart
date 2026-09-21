import { PostTypes } from '../consts';

/**
 * Bài đăng sống 3 tháng kể từ lúc được duyệt (CHỐT-05, CHỐT-07).
 */
export const PostLifetimeMonths = 3;

/** Số lần một bài được phép gia hạn (CHỐT-07). */
export const PostMaxRenewals = 1;

/**
 * Cộng thêm tháng mà KHÔNG để ngày tràn sang tháng sau.
 *
 * `Date.setMonth()` trần cộng xong mới chuẩn hoá, nên 30/11 cộng 3 tháng ra
 * 30/02 rồi bị đẩy thành 02/03 — bài hết hạn sớm hai ngày so với điều đã hứa
 * với người đăng. Ở đây kẹp về ngày cuối tháng đích: 30/11 → 28/02.
 */
export function addMonthsClamped(from: Date, months: number): Date {
  const year = from.getFullYear();
  const month = from.getMonth() + months;
  const lastDayOfTargetMonth = new Date(year, month + 1, 0).getDate();

  const result = new Date(from);
  result.setDate(Math.min(from.getDate(), lastDayOfTargetMonth));
  result.setMonth(month);
  return result;
}

/** Mốc hết hạn của một bài vừa được đưa lên công khai. */
export function postExpiryDate(publishedAt: Date): Date {
  return addMonthsClamped(publishedAt, PostLifetimeMonths);
}

/**
 * Bài rao vặt không "hết hạn" mà **chuyển thành Muốn Tặng** (CHỐT-05).
 *
 * Tách ra thành một hàm để nơi quét định kỳ và tài liệu cùng đọc một chỗ,
 * thay vì mỗi nơi tự nhớ một nửa quy định.
 */
export function expiryConvertsToOffer(postType: PostTypes): boolean {
  return postType === PostTypes.CLASSIFIED;
}
