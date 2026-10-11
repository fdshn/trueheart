import { PostTypes } from '../consts';

/**
 * Bài đăng sống 3 tháng kể từ lúc được duyệt (CHỐT-05, CHỐT-07).
 *
 * **KHÔNG áp cho `OFFER`/`WANTED` nữa** — CHỐT-10 cho hai loại đó vòng đời riêng
 * 7 + 30 ngày. Dùng `postExpiryDateFor` thay vì gọi `postExpiryDate` trực tiếp.
 */
export const PostLifetimeMonths = 3;

/**
 * Giai đoạn xét ứng viên, tính từ **lúc đăng** (CHỐT-10).
 *
 * Mốc này trước 07/10 bắt đầu từ **phản hồi đầu tiên**, nên một bài không ai xin
 * thì `selection_deadline` là `null` vĩnh viễn — nó không bao giờ tới hạn, không
 * bao giờ vào giai đoạn mở rộng, và chỉ chết ở mốc ba tháng. Đếm từ lúc đăng thì
 * bài không có phản hồi nào cũng có hạn.
 */
export const SelectionWindowDays = 7;

/**
 * Giai đoạn mở rộng, TỰ ĐỘNG khi hết hạn xét mà chưa ghép được ai (CHỐT-10).
 *
 * Đây là thứ thay thế chế độ `EXTENDED` cũ: không còn ai chọn nó, mọi bài chưa
 * ghép được đều được thêm khoảng này. Trong khoảng đó bài **vẫn nhận phản hồi**
 * và vẫn áp cơ chế ghép — nó không phải một giai đoạn chờ chết.
 */
export const ExtensionWindowDays = 30;

/**
 * Bài đi theo vòng đời 7 + 30 ngày thay vì 3 tháng (CHỐT-10).
 *
 * Tách thành một hàm có tên chứ không rải `=== OFFER` khắp nơi: hiện có ba chỗ
 * phải trả lời câu này (đặt hạn lúc đăng, hạn dự phòng lúc kiểm duyệt, và vòng
 * quét hết hạn), và ba chỗ tự nhớ một nửa quy định là cách CHỐT-05 từng bị hiểu
 * lệch.
 *
 * ## `WANTED` CHƯA vào đây, và đó là một chốt an toàn chứ không phải việc bỏ sót
 *
 * CHỐT-10 nói chế độ chọn và mốc 7+30 áp cho **cả hai** loại bài. Nhưng bật nó
 * cho `WANTED` ngay bây giờ sẽ hỏng dữ liệu, đo được 11/10:
 *
 * - truy vấn tìm bài tới hạn trong `gift-request.repository` **không lọc
 *   `post_type`** — nên hễ `selection_deadline` có giá trị là job xét tới;
 * - và nó lấy `SELECT post.author_id AS giver_id`.
 *
 * Với bài `WANTED`, tác giả là người **muốn NHẬN**. Nên đặt hạn cho `WANTED` là
 * để job tự dựng giao dịch với hai vai ngược nhau: người cần đồ thành người
 * tặng, người đề nghị cho thành người nhận. Hai bút toán điểm, bộ đếm rank và
 * `GET /transactions` đều đọc theo hai cột đó.
 *
 * Mở `WANTED` vì vậy là một lượt riêng: phải đảo vai ở đường auto-select và ở
 * `acceptRequest` trước, rồi mới bật cờ này. Và cũng vì thế `WANTED` tạm giữ
 * vòng đời ba tháng: rút xuống 37 ngày trong khi cơ chế ghép của nó chưa chạy
 * chỉ là làm bài của người ta chết sớm hơn mà không bù lại gì.
 */
export function usesSelectionLifecycle(postType: PostTypes): boolean {
  return postType === PostTypes.OFFER;
}

/** Cộng ngày. Tách ra để mọi mốc của CHỐT-10 cùng đi qua một chỗ. */
export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Hạn xét ứng viên = lúc đăng + 7 ngày (CHỐT-10).
 *
 * Trả về mốc cho **mọi** chế độ, kể cả `INSTANT`. Đặc tả nói rõ: bài `INSTANT`
 * không có giai đoạn *xét ứng viên*, nhưng vẫn có mốc 7 ngày đầu, và chưa ghép
 * được ai thì cũng tự mở thêm 30 ngày. Để `null` cho `INSTANT` là làm nó thành
 * bài duy nhất không có đồng hồ nào.
 */
export function selectionDeadlineFrom(publishedAt: Date): Date {
  return addDays(publishedAt, SelectionWindowDays);
}

/**
 * Mốc hết hạn theo LOẠI bài.
 *
 * `OFFER`/`WANTED`: 7 + 30 = **37 ngày** từ lúc đăng. Mọi loại khác giữ 3 tháng
 * của CHỐT-05/CHỐT-07 — CHỐT-10 nói thẳng là nó chỉ bỏ vòng đời ba tháng "cho
 * hai loại bài này", nên đây là một phép thu hẹp chứ không phải một mâu thuẫn.
 *
 * Giai đoạn mở rộng **không cần cột trạng thái mới**: nó chính là khoảng giữa
 * `selection_deadline` và `expires_at`. Thêm một cờ `IS_EXTENDED` là thêm một
 * nguồn sự thật thứ hai cho một điều đã suy ra được từ hai cái mốc.
 */
export function postExpiryDateFor(
  postType: PostTypes,
  publishedAt: Date,
): Date {
  return usesSelectionLifecycle(postType)
    ? addDays(publishedAt, SelectionWindowDays + ExtensionWindowDays)
    : postExpiryDate(publishedAt);
}

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
