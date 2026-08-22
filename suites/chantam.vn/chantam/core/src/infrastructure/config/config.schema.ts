import * as Joi from 'joi';

/**
 * Validate biến môi trường ngay lúc khởi động.
 *
 * Thà sập ngay khi boot với thông báo rõ ràng, còn hơn chạy được rồi mới lỗi
 * lúc 2 giờ sáng vì thiếu một biến.
 */
export const ConfigSchema = Joi.object({
  PORT: Joi.number().port().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production')
    .default('development'),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .optional(),

  DATABASE_URI: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  REDIS_URI: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),

  GEO_JITTER_RADIUS_METERS: Joi.number().min(50).max(5_000).default(300),
});
