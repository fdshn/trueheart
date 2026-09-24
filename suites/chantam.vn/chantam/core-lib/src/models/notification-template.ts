/**
 * Mẫu thông báo Admin sửa được lúc chạy (F62).
 *
 * Chữ nghĩa trong thông báo là thứ đổi thường xuyên nhất và ít rủi ro nhất —
 * bắt chờ một lần deploy để sửa một dấu phẩy là lý do khiến không ai buồn sửa.
 */

export const MaxNotificationTitleLength = 150;
export const MaxNotificationBodyLength = 500;

/**
 * Thay chỗ trống dạng `{tên}` bằng giá trị.
 *
 * Chỗ trống không có giá trị thì **giữ nguyên** thay vì xoá đi: một thông báo
 * hiện ra `{senderName}` là lỗi nhìn thấy ngay và sửa được, còn một câu cụt
 * giữa chừng thì trông như nội dung thật và sống sót rất lâu.
 *
 * Không đệ quy: giá trị chứa `{...}` không được thay tiếp, nếu không một biến
 * do người dùng nhập có thể kéo theo biến khác.
 */
export function renderNotificationTemplate(
  template: string,
  variables: Readonly<Record<string, string>> = {},
): string {
  return template.replace(
    /\{([a-zA-Z0-9_]+)\}/g,
    (placeholder, name: string) =>
      Object.prototype.hasOwnProperty.call(variables, name)
        ? variables[name]
        : placeholder,
  );
}

/** Tên các chỗ trống có trong một mẫu, không trùng lặp. */
export function templatePlaceholders(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(/\{([a-zA-Z0-9_]+)\}/g))
    found.add(match[1]);
  return [...found];
}
