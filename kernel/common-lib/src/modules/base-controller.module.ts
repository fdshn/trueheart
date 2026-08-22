import {
  ClassSerializerInterceptor,
  DynamicModule,
  HttpStatus,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE, Reflector } from '@nestjs/core';
import { ValidationError } from 'class-validator';
import { ErrorCodes, ErrorOrigin } from '../consts';
import { ApplicationExceptionFilter, Exception } from '../exception';

/** Trải lỗi validate lồng nhau thành danh sách phẳng "trường: thông báo". */
function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): string[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;

    const messages = Object.values(error.constraints ?? {}).map(
      (constraint) => `${field}: ${constraint}`,
    );

    if (error.children?.length)
      messages.push(...flattenValidationErrors(error.children, field));

    return messages;
  });
}

class ValidationFailedException extends Exception {
  public static readonly httpStatus = HttpStatus.BAD_REQUEST;

  public constructor(messages: string[]) {
    super(
      ErrorCodes.VALIDATION_FAILED,
      messages[0] ?? 'Dữ liệu gửi lên không hợp lệ',
      messages.slice(1),
      ErrorOrigin,
    );
  }
}

/**
 * Gắn ba thứ mà mọi service HTTP đều cần:
 * - ValidationPipe: `whitelist` loại bỏ field lạ, `transform` áp dụng @Type()
 * - ClassSerializerInterceptor: tôn trọng @Exclude() trên entity (che credentials)
 * - ApplicationExceptionFilter: quy mọi lỗi về một hình dạng ResponseDto
 */
@Module({})
export class BaseControllerModule {
  public static forRoot(): DynamicModule {
    return {
      global: true,
      module: BaseControllerModule,
      providers: [
        {
          provide: APP_PIPE,
          useValue: new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidUnknownValues: true,
            exceptionFactory: (errors: ValidationError[]) =>
              new ValidationFailedException(flattenValidationErrors(errors)),
          }),
        },
        {
          provide: APP_INTERCEPTOR,
          inject: [Reflector],
          useFactory: (reflector: Reflector) =>
            new ClassSerializerInterceptor(reflector),
        },
        { provide: APP_FILTER, useClass: ApplicationExceptionFilter },
        ApplicationExceptionFilter,
      ],
      exports: [ApplicationExceptionFilter],
    };
  }
}
