import {
  ClassSerializerInterceptor,
  DynamicModule,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE, Reflector } from '@nestjs/core';
import { ValidationError } from 'class-validator';
import {
  ApplicationExceptionFilter,
  ValidationFailedException,
} from '../exception';

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
