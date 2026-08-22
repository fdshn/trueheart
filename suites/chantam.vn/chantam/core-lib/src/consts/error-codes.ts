/**
 * Mã lỗi nghiệp vụ của Chân Tâm.
 *
 * Định dạng `0x<ResourceId><ReasonId>`. ResourceId đếm từ `0x01` trong phạm vi
 * package này; ReasonId đếm từ `0x01` trong mỗi nhóm resource. Trùng số với
 * package khác là bình thường — `ErrorOrigin` phân biệt chúng.
 */
export enum ErrorCodes {
  // 0x01 — Bài đăng cho tặng
  GIFT_POST_NOT_FOUND = 0x01_01,
  GIFT_POST_INVALID_LOCATION = 0x01_02,
  GIFT_POST_ALREADY_CLOSED = 0x01_03,
  GIFT_POST_OUT_OF_STOCK = 0x01_04,

  // 0x02 — Yêu cầu xin đồ (dành cho giai đoạn sau)
  GIFT_REQUEST_NOT_FOUND = 0x02_01,
  GIFT_REQUEST_DUPLICATED = 0x02_02,

  // 0x03 — Thành viên (dành cho giai đoạn sau)
  MEMBER_NOT_FOUND = 0x03_01,
  MEMBER_NOT_VERIFIED = 0x03_02,
  MEMBER_SUSPENDED = 0x03_03,
}

export const ErrorOrigin = 'chantam/core';
