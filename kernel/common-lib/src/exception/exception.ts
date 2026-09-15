// Nạp thẳng file thay vì barrel: `consts/index.ts` còn export `error-catalog`,
// mà file đó lại import ngược về `exception/` — đi qua barrel là thành vòng.
import { ErrorCodes, ErrorOrigin } from '../consts/error-codes';

/**
 * Lớp cơ sở của mọi lỗi nghiệp vụ.
 *
 * Không bao giờ `throw new Error(...)` trong luồng nghiệp vụ — luôn dùng một
 * class con của Exception kèm mã lỗi (INVARIANTS.md mục 8).
 *
 * `httpStatus` là thuộc tính tĩnh của class con; `ApplicationExceptionFilter`
 * đọc nó để quyết định mã HTTP trả về.
 */
export class Exception extends Error {
  public static readonly httpStatus: number;

  public constructor(
    public readonly code: number = ErrorCodes.UNKNOWN_ERROR,
    message: string,
    public readonly explains?: string[],
    public readonly origin: string = ErrorOrigin,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
