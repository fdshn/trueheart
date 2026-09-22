/**
 * Con trỏ phân trang theo KHOÁ SẮP XẾP, dùng chung cho tin nhắn và bình luận.
 *
 * **Vì sao không dùng `page`/`pageSize` như chỗ khác.** Chat và bình luận đều là danh sách được
 * thêm vào ĐẦU. Người dùng cuộn lên xem lịch sử trong khi tin mới vẫn đến; mỗi
 * tin mới đẩy toàn bộ cửa sổ OFFSET xuống một dòng, nên trang 2 sẽ lặp lại tin
 * cuối của trang 1 — hoặc bỏ sót nếu người kia xoá. Với danh sách bài đăng thì
 * lệch một dòng là chuyện nhỏ; với hội thoại thì đó là tin nhắn biến mất.
 *
 * Con trỏ trỏ vào một tin CỤ THỂ nên cửa sổ không trôi: "cho tôi 30 tin trước
 * tin này" luôn trả về đúng 30 tin đó dù có bao nhiêu tin mới đến.
 *
 * Khoá sắp xếp là cặp `(createdAt, id)` chứ không chỉ `createdAt`: hai tin cùng
 * một mốc millisecond thì thiếu `id` sẽ không phân định được bên nào trước.
 */
export interface IKeysetCursor {
  createdAt: Date;
  id: number;
}

/**
 * Mã hoá thành một chuỗi đục.
 *
 * Đục có chủ đích: client không đọc, không tự chế, nên sau này đổi khoá sắp xếp
 * không phải đổi hợp đồng API. Đây KHÔNG phải mã hoá bảo mật — nội dung chỉ là
 * mốc thời gian và id tự tăng của một tin mà người gọi vừa được xem; ai đọc ra
 * cũng không biết thêm điều gì, và mọi truy vấn vẫn bị chặn bởi phép kiểm
 * người-trong-phòng ở tầng trên.
 */
export function encodeKeysetCursor(cursor: IKeysetCursor): string {
  const raw = `${cursor.createdAt.getTime()}.${cursor.id}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

/**
 * Giải mã. Trả `null` cho mọi chuỗi hỏng thay vì ném lỗi.
 *
 * Con trỏ hỏng đến từ client cũ, link dán tay, hoặc bookmark — không phải lỗi
 * hệ thống. Nơi gọi coi `null` là "không có con trỏ" và trả về trang mới nhất,
 * thứ mà người dùng luôn xem được; ném 500 vào mặt họ thì không.
 */
export function decodeKeysetCursor(
  value: string | undefined | null,
): IKeysetCursor | null {
  if (!value) return null;

  let raw: string;
  try {
    raw = Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const separator = raw.lastIndexOf('.');
  if (separator <= 0) return null;

  const millis = Number(raw.slice(0, separator));
  const id = Number(raw.slice(separator + 1));

  // `Number.isSafeInteger` loại luôn NaN, Infinity và số thực — ba thứ mà một
  // chuỗi bịa ra dễ tạo nhất, và cũng là ba thứ sẽ thành `NULL` trong SQL rồi
  // âm thầm trả về mảng rỗng thay vì báo hỏng.
  if (!Number.isSafeInteger(millis) || !Number.isSafeInteger(id)) return null;
  if (id <= 0 || millis <= 0) return null;

  return { createdAt: new Date(millis), id };
}
