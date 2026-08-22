import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ErrorCodes } from '../consts';
import { ResponseDto } from '../dto/response.dto';
import { Exception } from './exception';

/**
 * Bắt mọi lỗi thoát ra khỏi controller và quy về một hình dạng ResponseDto duy nhất.
 *
 * Bắt `Error` (không phải chỉ `HttpException`) để một lỗi ngoài dự kiến cũng
 * không làm rò rỉ stack trace ra client.
 */
@Catch(Error)
export class ApplicationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApplicationExceptionFilter.name);

  private extractHttpExceptionMessages(exception: Error): string[] {
    if (!(exception instanceof HttpException)) return [];

    const response = exception.getResponse();
    if (typeof response === 'string') return [response];

    const message = (response as { message?: string | string[] }).message;
    if (typeof message === 'string') return [message];

    return message ?? [];
  }

  private resolveHttpStatus(exception: Error): number {
    if (exception instanceof HttpException) return exception.getStatus();

    const declared = (exception.constructor as { httpStatus?: number })
      .httpStatus;

    return declared ?? HttpStatus.INTERNAL_SERVER_ERROR;
  }

  public catch(exception: Error, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<FastifyReply>();
    const request = context.getRequest<FastifyRequest>();

    const httpStatus = this.resolveHttpStatus(exception);
    const errorCode =
      exception instanceof Exception
        ? exception.code
        : ErrorCodes.UNKNOWN_ERROR;
    const errorOrigin =
      exception instanceof Exception ? exception.origin : undefined;

    const messages: string[] = [];
    if (exception instanceof Exception)
      messages.push(exception.message, ...(exception.explains ?? []));
    else messages.push(...this.extractHttpExceptionMessages(exception));

    if (messages.length === 0) messages.push('Đã xảy ra lỗi không xác định');

    // Lỗi 5xx là lỗi của hệ thống — log kèm stack. Lỗi 4xx là lỗi của người gọi.
    if (httpStatus >= HttpStatus.INTERNAL_SERVER_ERROR)
      this.logger.error(
        `${request.method} ${request.url} -> ${httpStatus}`,
        exception.stack,
      );
    else this.logger.debug(`${request.method} ${request.url} -> ${httpStatus}`);

    void response
      .status(httpStatus)
      .send(
        ResponseDto.Builder.create<null>()
          .fail(errorCode, errorOrigin)
          .notify(messages)
          .attach(null)
          .build(),
      );
  }
}
