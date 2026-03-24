import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  directUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
  schema: process.env.DATABASE_SCHEMA || 'public',
}));

export const databaseConfigSchema = {
  DATABASE_URL: Joi.string().required(),
  DIRECT_URL: Joi.string().optional(),
  DATABASE_SCHEMA: Joi.string().default('public'),
};

export interface DatabaseConfig {
  url: string;
  directUrl: string;
  schema: string;
}
