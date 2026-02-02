import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export const redisConfig = registerAs('redis', () => {
  // Support for Upstash Redis (REST API) or traditional Redis
  const nodeEnv = process.env.NODE_ENV || 'development';
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  // Use Upstash in production if credentials are available
  if (nodeEnv === 'production' && upstashUrl && upstashToken) {
    return {
      // Upstash Redis configuration
      upstash: {
        url: upstashUrl,
        token: upstashToken,
      },
      type: 'upstash',
      retryAttempts: parseInt(process.env.REDIS_RETRY_ATTEMPTS || '3', 10),
      retryDelay: parseInt(process.env.REDIS_RETRY_DELAY || '1000', 10),
    };
  }

  // Use traditional Redis for development or fallback
  return {
    // Traditional Redis configuration
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    type: 'traditional',
    retryAttempts: parseInt(process.env.REDIS_RETRY_ATTEMPTS || '3', 10),
    retryDelay: parseInt(process.env.REDIS_RETRY_DELAY || '1000', 10),
  };
});

export const redisConfigSchema = {
  // Traditional Redis
  REDIS_URL: Joi.string().optional(),
  REDIS_HOST: Joi.string().when('UPSTASH_REDIS_REST_URL', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.string().default('localhost'),
  }),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().optional(),

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: Joi.string().uri().optional(),
  UPSTASH_REDIS_REST_TOKEN: Joi.string().when('UPSTASH_REDIS_REST_URL', {
    is: Joi.exist(),
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  // Common settings
  REDIS_RETRY_ATTEMPTS: Joi.number().min(1).default(3),
  REDIS_RETRY_DELAY: Joi.number().min(100).default(1000),
};

export interface RedisConfig {
  upstash?: {
    url: string;
    token: string;
  };
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  type: 'upstash' | 'traditional';
  retryAttempts: number;
  retryDelay: number;
}
