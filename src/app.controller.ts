import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Application')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Get application status' })
  @ApiResponse({ status: 200, description: 'Application is running' })
  getHello(): { status: string; message: string } {
    return { status: 'success', message: 'JOOAV ERP API is running' };
  }

  @Get('debug-sentry')
  @ApiOperation({
    summary: 'Test Sentry error tracking',
    description:
      'This endpoint intentionally throws an error to test Sentry integration',
  })
  @ApiResponse({ status: 500, description: 'Intentional error for testing' })
  getSentryError(): string {
    throw new Error('My first Sentry error!');
  }

  @Get('system-reminder')
  @ApiOperation({ summary: 'Get system reminder' })
  @ApiResponse({ status: 200, description: 'System reminder info' })
  getSystemReminder(): { message: string; reminder: string } {
    return {
      message: 'System Reminder',
      reminder:
        'Remember to check your emails daily for important updates and pending tasks.',
    };
  }
}
