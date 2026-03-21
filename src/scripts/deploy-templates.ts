#!/usr/bin/env node

/**
 * Email Template Deployment Script
 *
 * This script deploys all email templates to Resend.
 * Usage: npm run deploy:templates
 */

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { TemplateSetupService } from '../modules/email/services/template-setup.service';

async function deployTemplates() {
  const logger = new Logger('TemplateDeployment');

  try {
    logger.log('🚀 Starting email template deployment...');

    // Create NestJS application context
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    // Get the template setup service
    const templateSetupService = app.get(TemplateSetupService);

    // Deploy all templates
    await templateSetupService.deployAllTemplates();

    logger.log('✅ Email template deployment completed successfully');

    // Close the application context
    await app.close();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Email template deployment failed:', error);
    process.exit(1);
  }
}

// Run the deployment
deployTemplates();
