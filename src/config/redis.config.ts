import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export const redisConfig = registerAs('redis', () => {
  // Support for Upstash Redis (REST API) or traditional Redis
  const nodeEnv = process.env.NODE_ENV || 'development';
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const redisUrl = process.env.REDIS_URL;

  // Use Upstash in production if credentials are available
  if (nodeEnv === 'production' && (upstashUrl || redisUrl)) {
    return {
      // Upstash Redis configuration
      upstash: {
        url: upstashUrl,
        token: upstashToken,
      },
      redisUrl: redisUrl,
      type: 'upstash',
      retryAttempts: parseInt(process.env.REDIS_RETRY_ATTEMPTS || '3', 10),
      retryDelay: parseInt(process.env.REDIS_RETRY_DELAY || '1000', 10),
      // ioredis options for Upstash - UPDATED TO MATCH app.module.ts
      ioredisOptions: {
        maxRetriesPerRequest: null, // Unlimited retries
        retryDelayOnFailover: 1000, // Increased from 100ms to 1s
        enableReadyCheck: false,
        lazyConnect: true,
        keepAlive: 30000,
        family: 4,
        connectTimeout: 60000,
        commandTimeout: 15000, // Increased from 5s to 15s
        tls: { rejectUnauthorized: false },
      },
    };
  }

  // Use traditional Redis for development or fallback
  return {
    // Traditional Redis configuration
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === 'true',
    type: 'traditional',
    retryAttempts: parseInt(process.env.REDIS_RETRY_ATTEMPTS || '3', 10),
    retryDelay: parseInt(process.env.REDIS_RETRY_DELAY || '1000', 10),
    // ioredis options for traditional Redis - UPDATED TO MATCH app.module.ts
    ioredisOptions: {
      maxRetriesPerRequest: null, // Unlimited retries for consistency
      retryDelayOnFailover: 1000, // Increased delay
      commandTimeout: 15000, // Consistent timeout
    },
  };
});

export const redisConfigSchema = {
  // Traditional Redis
  REDIS_URL: Joi.string().optional(),
  REDIS_HOST: Joi.string().when('REDIS_URL', {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.string().default('localhost'),
  }),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().optional(),
  REDIS_TLS: Joi.boolean().default(false),

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: Joi.string().uri().optional(),
  UPSTASH_REDIS_REST_TOKEN: Joi.string().when('UPSTASH_REDIS_REST_URL', {
    is: Joi.exist(),
    then: Joi.optional(),
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
  redisUrl?: string;
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  tls?: boolean;
  type: 'upstash' | 'traditional';
  retryAttempts: number;
  retryDelay: number;
  ioredisOptions: {
    maxRetriesPerRequest: number | null; // Allow null for unlimited retries
    retryDelayOnFailover: number;
    enableReadyCheck?: boolean;
    lazyConnect?: boolean;
    keepAlive?: number;
    family?: number;
    connectTimeout?: number;
    commandTimeout?: number;
    tls?: { rejectUnauthorized: boolean };
  };
}
