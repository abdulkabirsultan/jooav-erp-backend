import * as Joi from 'joi';
import { appConfig, appConfigSchema } from './app.config';
import { databaseConfig, databaseConfigSchema } from './database.config';
import { redisConfig, redisConfigSchema } from './redis.config';
import { securityConfig, securityConfigSchema } from './security.config';
import { swaggerConfig, swaggerConfigSchema } from './swagger.config';
import { loggingConfig, loggingConfigSchema } from './logging.config';
import { emailConfig, emailConfigSchema } from './email.config';
import { monnifyConfig, monnifyConfigSchema } from './monnify.config';
import cloudinaryConfig from './cloudinary.config';
import sentryConfig from './sentry.config';

// Export individual configs
export { appConfig };
export { databaseConfig };
export { securityConfig };
export { loggingConfig };
export { default as cloudinaryConfig } from './cloudinary.config';
export { redisConfig };
export { swaggerConfig };
export { emailConfig };
export { monnifyConfig };
export { default as sentryConfig } from './sentry.config';

// Cloudinary validation schema
const cloudinaryConfigSchema = {
  CLOUDINARY_CLOUD_NAME: Joi.string().required(),
  CLOUDINARY_API_KEY: Joi.string().required(),
  CLOUDINARY_API_SECRET: Joi.string().required(),
  CLOUDINARY_FOLDER: Joi.string().default('jooav-erp'),
  CLOUDINARY_MAX_FILE_SIZE: Joi.number().default(10485760),
  CLOUDINARY_ALLOWED_FORMATS: Joi.string().default(
    'jpg,jpeg,png,gif,webp,pdf,doc,docx,xls,xlsx',
  ),
};

// Sentry validation schema
const sentryConfigSchema = {
  SENTRY_DSN: Joi.string().optional(),
};

// Combined validation schema
export const validationSchema = Joi.object({
  ...appConfigSchema,
  ...databaseConfigSchema,
  ...redisConfigSchema,
  ...securityConfigSchema,
  ...swaggerConfigSchema,
  ...loggingConfigSchema,
  ...emailConfigSchema,
  ...monnifyConfigSchema,
  ...cloudinaryConfigSchema,
  ...sentryConfigSchema,
});

// Configuration array for ConfigModule
export const configurations = [
  appConfig,
  databaseConfig,
  redisConfig,
  securityConfig,
  swaggerConfig,
  loggingConfig,
  emailConfig,
  monnifyConfig,
  cloudinaryConfig,
  sentryConfig,
];
