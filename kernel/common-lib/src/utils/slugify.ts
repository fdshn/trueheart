/**
 * Chuyển tiêu đề tiếng Việt thành slug ASCII.
 *
 * `normalize('NFD')` tách dấu thanh thành ký tự tổ hợp riêng rồi loại bỏ, nhưng
 * chữ "đ" không có dạng tổ hợp nên phải thay thủ công trước.
 *
 * @example slugify('Xe đạp cũ còn tốt') === 'xe-dap-cu-con-tot'
 */
export function slugify(input: string, maxLength = 80): string {
  return input
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
}
