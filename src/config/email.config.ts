import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export interface EmailConfig {
  enabled: boolean;
  queueFallbackEnabled: boolean;
  apiKey: string;
  fromAddress: string;
  fromName: string;
  baseUrl: string;
  wholesalerBaseUrl: string;
}

export const emailConfig = registerAs(
  'email',
  (): EmailConfig => ({
    enabled: process.env.EMAIL_ENABLED === 'true',
    queueFallbackEnabled:
      (process.env.EMAIL_QUEUE_FALLBACK_ENABLED || 'true') === 'true',
    apiKey: process.env.RESEND_API_KEY || '',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@jooav.com',
    fromName: process.env.EMAIL_FROM_NAME || 'JOOAV ERP',
    baseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
    wholesalerBaseUrl:
      process.env.WHOLESALER_BASE_URL || 'http://localhost:3000',
  }),
);

// Email configuration validation schema
export const emailConfigSchema = {
  EMAIL_ENABLED: Joi.boolean().default(true),
  EMAIL_QUEUE_FALLBACK_ENABLED: Joi.boolean().default(true),
  RESEND_API_KEY: Joi.string().when('EMAIL_ENABLED', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  EMAIL_FROM_ADDRESS: Joi.string().email().default('noreply@jooav.com'),
  EMAIL_FROM_NAME: Joi.string().default('JOOAV ERP'),
  APP_BASE_URL: Joi.string().uri().default('http://localhost:3000'),
  WHOLESALER_BASE_URL: Joi.string().uri().default('http://localhost:3000'),
};
