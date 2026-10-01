/**
 * Một capability được ĐỌC như thế nào.
 *
 * ## Vì sao điều này nằm trong CODE, không phải một cột trong database
 *
 * [24 §24.1](../../../../../docs/diagram/24-entitlement.md) từng vẽ
 * `capability_policies { value_type "NUMBER hoặc BOOLEAN" }`. Cột đó **không tồn tại**,
 * và nếu thêm vào thì nó sẽ thành đúng loại trường mà phân hệ này đã có vài cái: một ô
 * Admin đặt được mà không gì bảo đảm nó khớp với thực tế.
 *
 * Vì "capability này có hạn mức tiêu dần hay không" KHÔNG phải một lựa chọn cấu hình —
 * nó là sự thật về việc code có đếm hay không. Đặt `kind: QUOTA` cho một capability
 * không có bộ đếm thì `used` luôn bằng 0, và người dùng lại nhận một con số sai.
 */
export enum CapabilityKinds {
  /**
   * Có hạn mức TIÊU DẦN, và có một bộ đếm thật ở tầng dưới.
   *
   * Chỉ loại này mới có `used` và `remaining` nghĩa lý.
   */
  QUOTA = 'QUOTA',
  /** Cổng bật/tắt theo bậc. `limit` không có nghĩa, `used` cũng không. */
  GATE = 'GATE',
  /**
   * Mang một con số KHÔNG tiêu dần — ví dụ bán kính tìm kiếm tính theo mét.
   *
   * Trước 01/10 đường đọc áp hình dạng quota lên cả loại này, nên
   * `DISCOVERY_RADIUS` trả `remaining: 10000` — "còn lại 10 km" không nói lên gì.
   */
  VALUE = 'VALUE',
}

/**
 * Loại của từng capability đang có.
 *
 * Mã không có trong bảng này được coi là `VALUE`: nó có thể mang một con số, nhưng
 * không có bộ đếm nào nên KHÔNG được báo `used`. Lùi về `VALUE` chứ không về `QUOTA`
 * là có chủ ý — đoán sai thành quota là nói với người dùng một con số bịa.
 *
 * `test:entitlement-inventory` canh để không ai thêm capability vào database mà quên
 * khai ở đây.
 */
export const CapabilityKindByCode: Readonly<Record<string, CapabilityKinds>> = {
  POST_OPEN: CapabilityKinds.QUOTA,
  OPEN_REQUEST_QUOTA: CapabilityKinds.QUOTA,
  DISCOVERY_RADIUS: CapabilityKinds.VALUE,
  POST_SOS: CapabilityKinds.GATE,
  CREATE_GROUP: CapabilityKinds.GATE,
  REACT_CONTENT: CapabilityKinds.GATE,
  COMMENT_CONTENT: CapabilityKinds.GATE,
  SUBMIT_CHARITY_PROPOSAL: CapabilityKinds.GATE,
  // `SELECT_REQUESTER` có hạn mức 1/3/5/10 theo bậc nhưng KHÔNG chỗ nào đọc, nên
  // không ai biết đơn vị của nó là gì — mỗi bài được chọn mấy người, hay mỗi ngày?
  // Khai `VALUE` để nó không báo một `used` bịa ra, và ghi ở
  // `test:entitlement-inventory` là "khai mà chưa ai đọc".
  SELECT_REQUESTER: CapabilityKinds.VALUE,
};

export function capabilityKindOf(code: string): CapabilityKinds {
  return CapabilityKindByCode[code] ?? CapabilityKinds.VALUE;
}

/**
 * Hạn mức của một capability QUOTA, đọc theo lối FAIL-CLOSED.
 *
 * ## Vì sao `null` là 0 chứ không phải "không giới hạn"
 *
 * `IEntitlementPolicyRankValueDto.limit` từng được ghi chú là *"`null` nghĩa là không
 * giới hạn số lượng"*, trong khi `create-post` và `create-gift-request` đều đọc
 * `limit ?? 0`. Hai cách hiểu **ngược hẳn nhau** cho cùng một ô: Admin xoá trống ô
 * định mở khoá, thực tế là khoá sạch.
 *
 * Giữ lối fail-closed — một ô trống không được âm thầm bỏ mọi giới hạn — và chặn luôn
 * khả năng tạo ra ô trống đó: `assertQuotaLimitUsable` từ chối ngay ở đường Admin ghi.
 * Hàm này là lưới cuối cho dữ liệu cũ đã có `null` từ trước.
 */
export function resolveQuotaLimit(limit: number | null): number {
  return limit ?? 0;
}
