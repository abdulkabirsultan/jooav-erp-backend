import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export interface MonnifyConfig {
  baseUrl: string;
  apiKey: string;
  secretKey: string;
  contractCode: string;
  environment: 'sandbox' | 'production';
}

export const monnifyConfig = registerAs('monnify', () => ({
  baseUrl: process.env.MONNIFY_BASE_URL || 'https://sandbox.monnify.com',
  apiKey: process.env.MONNIFY_API_KEY || '',
  secretKey: process.env.MONNIFY_SECRET_KEY || '',
  contractCode: process.env.MONNIFY_CONTRACT_CODE || '',
  environment:
    (process.env.MONNIFY_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
}));

// Monnify configuration validation schema
export const monnifyConfigSchema = {
  MONNIFY_BASE_URL: Joi.string().uri().default('https://sandbox.monnify.com'),
  MONNIFY_API_KEY: Joi.string().required(),
  MONNIFY_SECRET_KEY: Joi.string().required(),
  MONNIFY_CONTRACT_CODE: Joi.string().required(),
  MONNIFY_ENVIRONMENT: Joi.string()
    .valid('sandbox', 'production')
    .default('sandbox'),
};
