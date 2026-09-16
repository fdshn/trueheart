import { ApiProperty, ApiSchema } from '@nestjs/swagger';
// Import trực tiếp file thay vì barrel để tránh vòng lặp import:
// exception/index.ts -> application-exception.filter.ts -> dto/index.ts -> response.dto.ts
import { Exception } from '../exception/exception';
import { Ctor } from '../utils/types';

/**
 * Bao ngoài thống nhất cho mọi response HTTP.
 *
 * Client luôn nhận đúng một hình dạng, kể cả khi lỗi — nhờ vậy lớp xử lý lỗi ở
 * mobile/web chỉ phải viết một lần. Cặp (errorOrigin, errorCode) xác định duy
 * nhất một loại lỗi trên toàn hệ thống.
 */
export interface IResponseDto<BodyType = any> {
  success: boolean;
  errorCode: number;
  errorOrigin?: string | null;
  message: string[];
  body: BodyType | null | undefined;
}

export class ResponseDto<BodyType = any> implements IResponseDto<BodyType> {
  @ApiProperty({
    description:
      'Gọi thành công hay không. Client kiểm trường này trước, đừng dựa vào mã HTTP.',
  })
  success: boolean;

  @ApiProperty({
    example: 0,
    description:
      'Mã lỗi. `0` khi thành công. Luôn đọc KÈM `errorOrigin` — hai tầng khác nhau được phép dùng trùng số.',
  })
  errorCode: number;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'chantam/core',
    description:
      'Tầng phát sinh lỗi: `kernel/common-lib`, `system/auth-lib` hoặc `chantam/core`. Cặp (errorOrigin, errorCode) là duy nhất toàn hệ thống.',
  })
  errorOrigin?: string | null;

  @ApiProperty({
    type: [String],
    description:
      'Mô tả lỗi cho người đọc. Rỗng khi thành công. ĐỪNG bắt lỗi theo chuỗi này — câu chữ sẽ đổi; hãy dùng (errorOrigin, errorCode).',
  })
  message: string[];

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Dữ liệu trả về. `null` khi có lỗi.',
  })
  body: BodyType | null | undefined;

  public static create<BodyType>(): ResponseBuilder<BodyType> {
    return new ResponseBuilder<BodyType>();
  }

  public static Builder: typeof ResponseBuilder;

  /**
   * Sinh một class con để Swagger hiển thị đúng kiểu của `body`.
   * Dùng trong `@ApiOkResponse({ type: ResponseDto.forApi(XResponseDto) })`.
   */
  public static forApi<BodyType = any>(bodyType: Ctor & { name: string }) {
    @ApiSchema({ name: `ResponseDto<${bodyType.name}>` })
    class ResponseDtoForApi extends ResponseDto<BodyType> {
      @ApiProperty({ type: bodyType, required: false, nullable: true })
      declare body: BodyType | null | undefined;
    }

    return ResponseDtoForApi;
  }

  /** Ném lại một response lỗi nhận từ service khác thành Exception cục bộ. */
  public static reThrow(response: IResponseDto<any>, httpStatus = 500): never {
    const exception = new Exception(
      response.errorCode,
      response.message[0] ?? 'unknown',
      response.message.slice(1),
      response.errorOrigin ?? undefined,
    );

    Object.defineProperty(exception.constructor, 'httpStatus', {
      value: httpStatus,
      configurable: true,
    });

    throw exception;
  }
}

class ResponseBuilder<BodyType> {
  private readonly response = new ResponseDto<BodyType>();

  public constructor() {
    this.response.success = true;
    this.response.errorCode = 0;
    this.response.errorOrigin = undefined;
    this.response.message = [];
    this.response.body = undefined;
  }

  public static create<BodyType>(): ResponseBuilder<BodyType> {
    return new ResponseBuilder<BodyType>();
  }

  public succeed(): this {
    this.response.success = true;
    this.response.errorCode = 0;

    return this;
  }

  public fail(errorCode: number, origin?: string): this {
    this.response.success = false;
    this.response.errorCode = errorCode;
    this.response.errorOrigin = origin;

    return this;
  }

  public notify(message: string[]): this {
    this.response.message = message;

    return this;
  }

  public attach(body: BodyType): this {
    this.response.body = body;

    return this;
  }

  public build(): ResponseDto<BodyType> {
    return this.response;
  }
}

ResponseDto.Builder = ResponseBuilder;

export { ResponseBuilder };
