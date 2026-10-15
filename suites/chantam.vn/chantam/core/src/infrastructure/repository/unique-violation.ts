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

/**
 * Postgres 23505 trên ĐÚNG ràng buộc mang tên `constraint`.
 *
 * Dùng khi một bảng có nhiều khoá UNIQUE và chỉ một khoá được dịch thành lỗi nghiệp vụ:
 * dịch nhầm khoá khác là che một lỗi thật bằng một câu báo sai.
 */
export function isUniqueViolationOn(
  error: unknown,
  constraint: string,
): boolean {
  const err = error as {
    constraint?: string;
    driverError?: { constraint?: string };
  };
  return (
    isUniqueViolation(error) &&
    (err?.constraint ?? err?.driverError?.constraint) === constraint
  );
}

/**
 * Postgres 23P01 — vi phạm ràng buộc EXCLUDE, đúng ràng buộc mang tên `constraint`.
 *
 * So cả TÊN: một bảng có thể có nhiều ràng buộc EXCLUDE, và đổi nhầm một cái khác thành
 * lỗi nghiệp vụ là che một lỗi thật bằng một câu báo sai.
 */
export function isExclusionViolation(
  error: unknown,
  constraint: string,
): boolean {
  const err = error as {
    code?: string;
    constraint?: string;
    driverError?: { code?: string; constraint?: string };
  };
  const code = err?.code ?? err?.driverError?.code;
  const name = err?.constraint ?? err?.driverError?.constraint;
  return code === '23P01' && name === constraint;
}
