import { DynamicModule, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

/**
 * Danh sách đường dẫn bị che trong log.
 *
 * Đây là lớp phòng vệ CUỐI CÙNG, không phải giấy phép để log bừa. Ứng dụng thu
 * thập CCCD, số điện thoại và toạ độ của người Việt — dữ liệu cá nhân theo
 * Nghị định 13/2023. Không đưa những thứ này vào log ngay từ đầu.
 */
const RedactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.otp',
  'req.body.credentials',
  'req.body.*.password',
  'req.body.*.phoneNumber',
  'req.body.*.identityNumber',
  'req.body.*.location',
  'res.headers["set-cookie"]',
  'password',
  'otp',
  'credentials',
  'identityNumber',
  'accessToken',
  'refreshToken',
];

export interface ILoggerOptions {
  /** Mặc định đọc từ `LOG_LEVEL`, rồi tới `debug` ở dev / `info` ở production. */
  level?: string;
  /** Bật định dạng dễ đọc cho người. Mặc định bật khi `NODE_ENV !== 'production'`. */
  pretty?: boolean;
}

@Module({})
export class LoggerModule {
  public static forRoot(options: ILoggerOptions = {}): DynamicModule {
    const isProduction = process.env.NODE_ENV === 'production';
    const pretty = options.pretty ?? !isProduction;
    const level =
      options.level ??
      process.env.LOG_LEVEL ??
      (isProduction ? 'info' : 'debug');

    return {
      global: true,
      module: LoggerModule,
      imports: [
        PinoLoggerModule.forRoot({
          pinoHttp: {
            level,
            redact: { paths: RedactPaths, censor: '[đã ẩn]' },
            transport: pretty
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:HH:MM:ss',
                    ignore: 'pid,hostname,req,res',
                  },
                }
              : undefined,
            // /health bị gọi liên tục bởi orchestrator — không làm nhiễu log.
            autoLogging: {
              ignore: (request) => (request.url ?? '').startsWith('/health'),
            },
          },
        }),
      ],
      exports: [PinoLoggerModule],
    };
  }
}
