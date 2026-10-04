/**
 * Rao vặt giá rẻ — phần THUẦN (SRS §3.3.10, UI-MARKET-01, CHỐT-05, F65 phân hệ 2).
 *
 * ## Phân hệ này gần như ĐÃ CÓ, và đây là phần còn thiếu
 *
 * Đo trước khi viết: `PostTypes.CLASSIFIED` đã có, `details.price` và `details.negotiable`
 * đã có, hạn mức đi chung `POST_OPEN` với mọi loại bài, và luật "hết 3 tháng thì CHUYỂN
 * thành Muốn Tặng" đã nối ở `post.repository.ts`. Tức SRS §3.3.10 gần như xong từ trước.
 *
 * Thiếu đúng một thứ, và nó là thứ `FEATURES.md` gọi là *"dữ liệu tham chiếu của Rao vặt"*:
 * **giá thị trường** (`marketPrice`). Không có nó thì UI-MARKET-01 không dựng được — đặc tả
 * đòi hiện *"giá tham khảo, giá bán và % chênh lệch/giảm"*, mà hệ thống chỉ có giá bán.
 *
 * ## CHỐT-05: giá tham khảo là LỜI KHAI, và không có mức giảm tối thiểu
 *
 * *"Giá thị trường là giá tham khảo do người bán tự khai... Hệ thống không có nguồn xác minh
 * giá trị thực và không ép mức giảm tối thiểu cố định."*
 *
 * Hai hệ quả, cả hai đều là thứ dễ tự ý thêm vào rồi thành sai đặc tả:
 *
 * - **Không kiểm `marketPrice >= price`.** Người bán khai giá tham khảo thấp hơn giá bán là
 *   vô lý về thương mại, nhưng chặn nó là ép một mức giảm tối thiểu bằng 0 — đúng thứ
 *   CHỐT-05 nói không làm. `classifiedDiscountPercent` trả số ÂM ở ca đó, và hiện đúng số
 *   âm là cách người mua tự thấy mà cân nhắc.
 * - **Không bắt buộc `marketPrice`.** Người bán không biết giá thị trường thì để trống, và
 *   `classifiedDiscountPercent` trả `null` — không phải `0`.
 *
 * ## Vì sao % giảm KHÔNG được lưu
 *
 * Lưu nó là tạo một con số thứ ba phải tự đồng bộ với hai con số kia. Sửa `price` qua
 * `PATCH /posts/:id` mà quên tính lại là hiện "giảm 40%" cho một món vừa tăng giá — đúng
 * lớp lỗi mà `posts.reaction_count` và `rank_tiers` đã mắc trong dự án này.
 *
 * Giá phải trả, ghi ra để không ai phát hiện muộn: app Flutter không import được hàm này,
 * nên nó tự làm tròn. Hai cách làm tròn có thể lệch nhau một đơn vị phần trăm. Chấp nhận
 * được — lệch một đơn vị trên một con số đã là LỜI KHAI thì không ai quyết định sai vì nó,
 * còn một con số lưu sẵn bị trôi thì sai hẳn.
 */

import { PostTypes } from '../consts/post-types';

/**
 * Trần giá, áp cho cả `price` và `marketPrice`.
 *
 * 1 tỷ VNĐ — **không phải con số tôi tự chọn.** Đây là trần đã áp cho `price` từ trước,
 * nhưng nó nằm rải hai nơi: một hằng `MaxPrice` cục bộ trong `create-post.dto.ts` và một
 * con số thô lặp lại trong `update-post.dto.ts`. Hai bản của cùng một trần là hai chỗ để
 * chúng trôi lệch nhau — và lúc đó một giá tạo được lại không sửa được, hoặc ngược lại.
 *
 * Để ở đây để cả hai DTO và phần kiểm nghiệp vụ cùng đọc một chỗ. Trần giá là thứ đáng
 * chặn vì cột là `jsonb` — database không chặn gì, và một con số 15 chữ số do gõ nhầm sẽ
 * dồn toàn bộ tin thật vào một pixel đầu thanh trượt khoảng giá.
 */
export const MaxClassifiedPrice = 1_000_000_000;

/** Giá và cờ thương lượng chỉ có nghĩa với tin rao bán. */
export function isClassifiedPricingType(postType: PostTypes): boolean {
  return postType === PostTypes.CLASSIFIED;
}

export function isClassifiedPrice(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= MaxClassifiedPrice
  );
}

/**
 * Đọc một con số tiền từ `jsonb`, hoặc `null` khi không có số nào đọc được.
 *
 * `Number()` một mình KHÔNG đủ, và chỗ này từng sai: `Number(null)` là `0`, `Number('')`
 * cũng là `0`. Nên một tin rao THIẾU giá sẽ tính ra "giảm 100%", tức giao diện nói món đồ
 * được cho không. `classified.spec.ts` bắt được đúng ca đó.
 *
 * Chỉ nhận `number` thật và chuỗi chữ số — `details` là `jsonb` nên số có thể về dạng
 * chuỗi, và loại bỏ hẳn chuỗi là làm mất % giảm đúng lúc dữ liệu vẫn đủ.
 */
function readMoney(value: unknown): number | null {
  if (typeof value === 'number')
    return Number.isFinite(value) && value >= 0 ? value : null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  // `null`, `undefined`, boolean, object — không có con số nào ở đây.
  return null;
}

/**
 * Phần trăm chênh so với giá tham khảo, hoặc `null` khi không có cơ sở để tính.
 *
 * `null` khi người bán không khai `marketPrice`, hoặc khai `0`. Trả `0` ở đó đọc ra "giảm
 * 0%", tức một lời khẳng định về giá mà người bán chưa hề nói.
 *
 * Số DƯƠNG là giảm giá. Số ÂM nghĩa là giá bán cao hơn giá tham khảo — xem CHỐT-05 ở
 * docblock đầu file: không chặn, và hiện đúng.
 */
export function classifiedDiscountPercent(input: {
  readonly marketPrice: unknown;
  readonly price: unknown;
}): number | null {
  const market = readMoney(input.marketPrice);
  const price = readMoney(input.price);

  if (market === null || market <= 0) return null;
  if (price === null) return null;

  return Math.round(((market - price) / market) * 100);
}

/**
 * Đọc % giảm thẳng từ `posts.details`.
 *
 * Bọc thêm một lớp vì `details` là `jsonb` — số có thể về dạng chuỗi, và khoá có thể
 * không tồn tại. Bên gọi không nên phải nhớ cả hai điều đó.
 */
export function classifiedDiscountPercentOfDetails(
  details: Record<string, unknown> | null | undefined,
): number | null {
  if (!details) return null;
  return classifiedDiscountPercent({
    marketPrice: details.marketPrice,
    price: details.price,
  });
}

/** Những chỗ khiến phần GIÁ của một tin rao vặt không hợp lệ. */
export function classifiedPricingGaps(input: {
  readonly price: unknown;
  readonly marketPrice: unknown;
}): string[] {
  const gaps: string[] = [];

  if (!isClassifiedPrice(input.price))
    gaps.push(`price phải là số nguyên VNĐ từ 0 tới ${MaxClassifiedPrice}`);

  // `marketPrice` TUỲ CHỌN — xem CHỐT-05. Chỉ kiểm khi người bán có khai.
  if (
    input.marketPrice !== undefined &&
    input.marketPrice !== null &&
    !isClassifiedPrice(input.marketPrice)
  )
    gaps.push(
      `marketPrice phải là số nguyên VNĐ từ 0 tới ${MaxClassifiedPrice}`,
    );

  return gaps;
}
