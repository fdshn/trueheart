import { Exception } from './exception';

/**
 * Một loại lỗi API: mã, mã HTTP và thông điệp trả cho người dùng, gom vào một
 * chỗ thay vì rải trong constructor của từng exception.
 *
 * `message` là hàm chứ không phải chuỗi vì nhiều thông điệp cần tham số (tên
 * đăng nhập bị trùng, số giây phải chờ...). Lỗi không tham số thì viết `() =>`.
 */
export interface IErrorDefinition<Args extends unknown[] = []> {
  readonly code: number;
  readonly httpStatus: number;
  readonly message: (...args: Args) => string;
  /**
   * Các dòng chi tiết kèm theo, ví dụ danh sách lỗi validate của từng trường.
   * Bỏ trống khi lỗi chỉ có một câu.
   */
  readonly explains?: (...args: Args) => string[] | undefined;
  /**
   * Bộ tham số mẫu để dựng câu ví dụ trong `docs/API-ERRORS.md`. Bắt buộc với
   * lỗi có tham số.
   *
   * Cố ý để kiểu lỏng: ép theo `Args` thì mọi mảng literal phải chú thích tuple
   * bằng tay, đổi lấy chút an toàn mà không đáng. Chốt chặn nằm ở
   * `bin/generate-error-docs.mjs` — nó dừng và báo lỗi nếu câu ví dụ dựng ra có
   * `undefined`, tức là mẫu thiếu hoặc không còn khớp chữ ký.
   */
  readonly sample?: readonly unknown[];
  /** Do `defineErrorCatalog` gắn vào, không khai tay. */
  readonly origin: string;
}

/** Bản khai một lỗi, chưa có `origin`. */
type ErrorDraft<Args extends unknown[]> = Omit<
  IErrorDefinition<Args>,
  'origin'
>;

export type ErrorCatalog = Readonly<Record<string, IErrorDefinition<any>>>;

/**
 * Gom các lỗi của một `origin` thành danh mục, và **chặn trùng mã ngay lúc nạp
 * module**.
 *
 * Phép kiểm trùng là lý do chính danh mục này tồn tại. Cặp `(origin, code)`
 * phải là duy nhất toàn hệ thống — client mobile dựa vào đó để phân biệt lỗi.
 * Khi mã nằm rải trong hai chục constructor thì không ai phát hiện được hai lỗi
 * lỡ dùng chung một số, cho tới lúc client xử lý sai.
 */
export function defineErrorCatalog<T extends Record<string, ErrorDraft<any>>>(
  origin: string,
  drafts: T,
): { readonly [K in keyof T]: T[K] & { readonly origin: string } } {
  const seen = new Map<number, string>();
  const entries: Record<string, unknown> = {};

  for (const [name, draft] of Object.entries(drafts)) {
    const duplicate = seen.get(draft.code);

    if (duplicate)
      throw new Error(
        `Danh mục lỗi "${origin}": ${name} và ${duplicate} cùng dùng mã ` +
          `0x${draft.code.toString(16)}. Cặp (origin, code) phải là duy nhất.`,
      );

    seen.set(draft.code, name);
    entries[name] = Object.freeze({ ...draft, origin });
  }

  return Object.freeze(entries) as never;
}

/**
 * Dựng lớp cơ sở cho một exception từ bản khai trong danh mục.
 *
 * ```typescript
 * export class UsernameTakenException extends ExceptionFrom(
 *   CoreErrors.USERNAME_TAKEN,
 * ) {}
 * ```
 *
 * Vẫn giữ class có tên riêng chứ không sinh thẳng ra đối tượng: `instanceof`
 * còn dùng được, và `@ApiErrorResponses` đọc tên class để đặt nhãn ví dụ trong
 * Swagger.
 */
export function ExceptionFrom<Args extends unknown[]>(
  definition: IErrorDefinition<Args>,
): (new (...args: Args) => Exception) & {
  /** `ApplicationExceptionFilter` đọc để quyết định mã HTTP trả về. */
  readonly httpStatus: number;
  /** Bản khai gốc, để công cụ sinh tài liệu đọc lại. */
  readonly definition: IErrorDefinition<Args>;
} {
  class CatalogException extends Exception {
    public static readonly httpStatus = definition.httpStatus;
    public static readonly definition = definition;

    public constructor(...args: Args) {
      super(
        definition.code,
        definition.message(...args),
        definition.explains?.(...args),
        definition.origin,
      );
    }
  }

  return CatalogException;
}
