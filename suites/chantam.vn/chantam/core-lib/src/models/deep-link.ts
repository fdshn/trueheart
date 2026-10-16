/**
 * Lược đồ deep link trong app (CMS B7).
 *
 * Hai tên cùng tồn tại vì hai phân hệ chọn khác nhau: chiến dịch Home dùng `givingapp://`,
 * banner tài trợ dùng `chantam://`. App mobile hiện CHƯA chốt sẽ đăng ký tên nào với hệ
 * điều hành, nên server nhận CẢ HAI ở mọi chỗ cho phép deep link — chọn một bây giờ là
 * đoán, và đoán sai thì mọi link đã lưu theo tên kia thành link chết.
 *
 * Khi mobile chốt, bỏ tên còn lại ở ĐÂY và ở CHECK `CHK_sponsor_banners_target_url`;
 * không chỗ nào khác giữ bản sao của danh sách này.
 */
export const AppDeepLinkSchemes = ['givingapp://', 'chantam://'] as const;

/** So khớp ĐẦU chuỗi, không `includes`: `javascript:alert('chantam://x')` có chứa nó. */
export function isAppDeepLink(value: string): boolean {
  return AppDeepLinkSchemes.some((scheme) => value.startsWith(scheme));
}
