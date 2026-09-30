import { createHash, createHmac } from 'node:crypto';

/**
 * Băm dấu vết đăng ký — IP và định danh thiết bị — để lưu vào `referrals`.
 *
 * ## Vì sao băm chứ không lưu thẳng
 *
 * Bảng `referrals` không xoá được (trigger `enforce_referral_qualification_transition`
 * chặn cả `DELETE`), nên nó giữ dấu vết của mọi lượt đăng ký mãi mãi. Lưu IP thô ở
 * một bảng như vậy là giữ lịch sử vị trí thô của người dùng vô thời hạn, cho một mục
 * đích duy nhất — SO TRÙNG — mà việc so trùng thì chỉ cần băm.
 *
 * ## Vì sao dùng chung pepper với `verified_phones`
 *
 * Cùng một mục đích: băm định danh sao cho so trùng được mà dò ngược thì không. Tách
 * thành khoá riêng sẽ thêm một biến môi trường nữa mà không ai đặt, và trong repo này
 * một khoá cấu hình không ai đặt là kiểu hỏng tệ hơn — nó im lặng.
 *
 * Thiếu pepper thì vẫn băm, chỉ là dò ngược được: không gian IPv4 đủ nhỏ để duyệt hết.
 * Không ném, vì chống trùng phải chạy được ở máy dev và ở staging chưa cắm gì.
 *
 * ## Vì sao có `kind`
 *
 * Cùng một chuỗi ở hai vai khác nhau phải ra hai băm khác nhau, nếu không một
 * `deviceId` trùng tình cờ với một địa chỉ IP sẽ đếm thành một cụm trùng.
 */
export function hashSignupFingerprint(
  kind: 'IP' | 'DEVICE',
  value: string | undefined | null,
  pepper: string,
): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;

  const material = `${kind}:${normalized}`;

  return pepper
    ? createHmac('sha256', pepper).update(material).digest('hex')
    : createHash('sha256').update(material).digest('hex');
}
