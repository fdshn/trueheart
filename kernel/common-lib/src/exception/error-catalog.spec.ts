import { defineErrorCatalog, ExceptionFrom } from './error-catalog';

describe('defineErrorCatalog', () => {
  it('gắn origin vào từng lỗi', () => {
    const catalog = defineErrorCatalog('test/lib', {
      A: { code: 1, httpStatus: 400, message: () => 'a' },
    });

    expect(catalog.A.origin).toBe('test/lib');
  });

  it('CHẶN hai lỗi dùng chung một mã', () => {
    // Đây là lý do danh mục tồn tại. Cặp (origin, code) phải duy nhất — client
    // mobile dựa vào đó để phân biệt lỗi. Trùng mã mà không ai biết thì client
    // xử lý sai, và lỗi chỉ lộ ra ở phía người dùng.
    expect(() =>
      defineErrorCatalog('test/lib', {
        A: { code: 0x03_07, httpStatus: 401, message: () => 'a' },
        B: { code: 0x03_07, httpStatus: 429, message: () => 'b' },
      }),
    ).toThrow(/B và A cùng dùng mã 0x307/);
  });

  it('không cho sửa danh mục sau khi khai', () => {
    const catalog = defineErrorCatalog('test/lib', {
      A: { code: 1, httpStatus: 400, message: () => 'a' },
    });

    expect(() => {
      (catalog as Record<string, unknown>).B = {};
    }).toThrow();
  });
});

describe('ExceptionFrom', () => {
  const Errors = defineErrorCatalog('test/lib', {
    SIMPLE: { code: 1, httpStatus: 404, message: () => 'không thấy' },
    WITH_ARGS: {
      code: 2,
      httpStatus: 409,
      message: (name: string) => `${name} đã tồn tại`,
    },
    WITH_EXPLAINS: {
      code: 3,
      httpStatus: 400,
      message: (lines: string[]) => lines[0] ?? 'lỗi',
      explains: (lines: string[]) => lines.slice(1),
    },
  });

  class NotFoundException extends ExceptionFrom(Errors.SIMPLE) {}
  class TakenException extends ExceptionFrom(Errors.WITH_ARGS) {}
  class InvalidException extends ExceptionFrom(Errors.WITH_EXPLAINS) {}

  it('lấy mã, origin và thông điệp từ danh mục', () => {
    const error = new NotFoundException();

    expect(error.code).toBe(1);
    expect(error.origin).toBe('test/lib');
    expect(error.message).toBe('không thấy');
  });

  it('đưa tham số vào thông điệp', () => {
    expect(new TakenException('an').message).toBe('an đã tồn tại');
  });

  it('tách dòng đầu làm thông điệp, phần còn lại làm explains', () => {
    const error = new InvalidException(['dòng 1', 'dòng 2', 'dòng 3']);

    expect(error.message).toBe('dòng 1');
    expect(error.explains).toEqual(['dòng 2', 'dòng 3']);
  });

  it('giữ httpStatus ở dạng thuộc tính tĩnh cho bộ lọc ngoại lệ đọc', () => {
    expect(NotFoundException.httpStatus).toBe(404);
    expect(TakenException.httpStatus).toBe(409);
  });

  it('giữ tên class để instanceof và tài liệu Swagger dùng được', () => {
    const error = new TakenException('an');

    expect(error).toBeInstanceOf(TakenException);
    expect(TakenException.name).toBe('TakenException');
  });
});
