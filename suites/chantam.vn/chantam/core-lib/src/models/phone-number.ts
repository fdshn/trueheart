/**
 * Mã quốc gia mặc định khi người dùng gõ số nội địa kiểu `0912345678`.
 *
 * Người dùng ở Việt Nam, và bắt họ gõ `+84` là bắt họ làm một việc mà không ứng
 * dụng nào khác bắt.
 */
export const DefaultPhoneCountryCode = '84';

/**
 * Đưa số điện thoại về E.164 (`+84912345678`).
 *
 * **Vì sao bắt buộc phải chuẩn hoá trước khi lưu và trước khi so trùng.**
 * `users.phone` có index UNIQUE, nhưng index so CHUỖI. `0912345678` và
 * `+84912345678` là cùng một SIM mà khác chuỗi, nên cả hai cùng lọt — và cùng
 * một SIM xác minh được hai tài khoản, ăn thưởng hai lần.
 *
 * Trả `null` khi không nắn được. Người gọi quyết định báo lỗi thế nào; hàm này
 * ở `core-lib` để service, Admin CMS và app dùng chung MỘT định nghĩa.
 */
export function normalizePhoneNumber(
  raw: string | null | undefined,
  countryCode: string = DefaultPhoneCountryCode,
): string | null {
  if (raw === null || raw === undefined) return null;

  // Bỏ mọi thứ người ta hay gõ xen vào: khoảng trắng, dấu chấm, gạch, ngoặc.
  const cleaned = raw.replace(/[\s.\-()]/g, '');

  if (!cleaned) return null;

  const hasPlus = cleaned.startsWith('+');
  const digits = (hasPlus ? cleaned.slice(1) : cleaned).replace(/\D/g, '');

  // Còn ký tự lạ sau khi bỏ dấu phân cách thì đây không phải số điện thoại.
  if (digits.length !== (hasPlus ? cleaned.length - 1 : cleaned.length))
    return null;

  if (hasPlus) return withinE164Length(digits) ? `+${digits}` : null;

  // `0` đầu là tiền tố quay số NỘI ĐỊA, không phải một chữ số của số thuê bao.
  if (digits.startsWith('0'))
    return withinE164Length(`${countryCode}${digits.slice(1)}`)
      ? `+${countryCode}${digits.slice(1)}`
      : null;

  // Gõ sẵn mã quốc gia mà quên dấu cộng.
  if (digits.startsWith(countryCode))
    return withinE164Length(digits) ? `+${digits}` : null;

  // Không có `0` đầu, không có mã quốc gia: coi như số nội địa thiếu tiền tố.
  return withinE164Length(`${countryCode}${digits}`)
    ? `+${countryCode}${digits}`
    : null;
}

/** E.164 cho phép tối đa 15 chữ số, và không số thật nào ngắn dưới 8. */
function withinE164Length(digits: string): boolean {
  return digits.length >= 8 && digits.length <= 15;
}
