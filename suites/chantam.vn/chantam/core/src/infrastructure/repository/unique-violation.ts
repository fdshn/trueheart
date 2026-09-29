/**
 * Postgres 23505 — vi phạm ràng buộc UNIQUE.
 *
 * Một hàm dùng chung vì tình huống luôn giống nhau: tầng trên kiểm "đã có chưa?"
 * để ra một thông báo đọc được, rồi mới ghi. Hai request song song cùng vượt qua
 * phép kiểm đó thì đúng một cái thắng, và cái thua phải nhận cùng một lỗi NGHIỆP
 * VỤ — không phải một lỗi ràng buộc 500 mà người dùng không hiểu và người vận hành
 * thì thấy như một sự cố.
 *
 * Đọc cả `driverError`: TypeORM bọc lỗi gốc lại, nên chỉ kiểm `code` ở lớp ngoài
 * sẽ bỏ sót đúng những lần nó được bọc.
 */
export function isUniqueViolation(error: unknown): boolean {
  const err = error as { code?: string; driverError?: { code?: string } };

  return err?.code === '23505' || err?.driverError?.code === '23505';
}
