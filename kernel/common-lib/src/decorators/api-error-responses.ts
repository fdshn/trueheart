import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { Exception } from '../exception/exception';

type ExceptionCtor = (new (...args: any[]) => Exception) & {
  httpStatus?: number;
};

/**
 * Một lỗi có thể xảy ra ở endpoint. Dạng mảng dùng khi constructor cần tham số:
 * `[OtpTooSoonException, 42]`.
 */
export type ApiErrorSpec = ExceptionCtor | [ExceptionCtor, ...any[]];

/**
 * Khai các lỗi một endpoint có thể trả về, **lấy thẳng từ class exception**.
 *
 * Viết mã lỗi bằng tay vào Swagger thì chỉ sau vài lần sửa là tài liệu nói một
 * đằng, mã chạy một nẻo — mà cặp `(errorOrigin, errorCode)` lại đúng là thứ
 * client mobile phải code theo. Ở đây decorator tự dựng lỗi lên để đọc mã, thông
 * điệp và HTTP status, nên sửa exception là tài liệu đổi theo.
 *
 * ```typescript
 * @ApiErrorResponses(InvalidCredentialsException, [OtpTooSoonException, 42])
 * ```
 */
export function ApiErrorResponses(
  ...specs: ApiErrorSpec[]
): ReturnType<typeof applyDecorators> {
  const byStatus = new Map<
    number,
    { name: string; code: number; origin: string; message: string }[]
  >();

  for (const spec of specs) {
    const [ctor, ...args] = Array.isArray(spec) ? spec : [spec];
    const instance = new ctor(...args);
    // 500 là mặc định của bộ lọc ngoại lệ khi class con quên khai `httpStatus`.
    const status = ctor.httpStatus ?? 500;

    const entry = {
      name: ctor.name.replace(/Exception$/, ''),
      code: instance.code,
      origin: instance.origin,
      message: instance.message,
    };

    byStatus.set(status, [...(byStatus.get(status) ?? []), entry]);
  }

  return applyDecorators(
    ...[...byStatus.entries()].map(([status, errors]) =>
      ApiResponse({
        status,
        description: errors
          .map((e) => `\`${e.code}\` (${e.origin}) — ${e.message}`)
          .join('\n\n'),
        content: {
          'application/json': {
            // Mỗi mã lỗi thành một ví dụ riêng: Swagger UI cho chọn từ danh
            // sách thả xuống, thấy ngay hình dạng thật của response.
            examples: Object.fromEntries(
              errors.map((e) => [
                e.name,
                {
                  summary: `${e.code} — ${e.message}`,
                  value: {
                    success: false,
                    errorCode: e.code,
                    errorOrigin: e.origin,
                    message: [e.message],
                    body: null,
                  },
                },
              ]),
            ),
          },
        },
      }),
    ),
  );
}
