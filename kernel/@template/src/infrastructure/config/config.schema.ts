import * as Joi from 'joi';

export const ConfigSchema = Joi.object({
  PORT: Joi.number().port().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production')
    .default('development'),
  LOG_LEVEL: Joi.string().optional(),
});
