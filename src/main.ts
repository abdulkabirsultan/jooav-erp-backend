// IMPORTANT: Import Sentry instrument at the very top
import './instrument';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
import compression from 'compression';

import { AppModule } from './app.module';
import { PrismaService } from './modules/prisma/prisma.service';
import { LoggerService, AppLogger } from './common/utils/logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);

  // Setup Winston logger
  const winstonLogger = LoggerService.createNestWinstonLogger(configService);
  app.useLogger(winstonLogger);

  // Initialize AppLogger for static use
  AppLogger.getInstance(configService);

  const logger = new Logger('Bootstrap');

  // Security middleware
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Compression
  app.use(compression());

  // CORS configuration
  const corsOrigins = configService.get('CORS_ORIGIN')
    ? configService
        .get('CORS_ORIGIN')
        .split(',')
        .map((origin) => origin.trim())
    : ['http://localhost:3001'];

  app.enableCors({
    origin: corsOrigins,
    credentials: configService.get('CORS_CREDENTIALS') === 'true',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );

  // API prefix
  const apiPrefix = configService.get('API_PREFIX') || 'api';
  const apiVersion = configService.get('API_VERSION') || 'v1';
  app.setGlobalPrefix(`${apiPrefix}/${apiVersion}`);

  // Swagger documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle(configService.get('SWAGGER_TITLE') || 'JOOAV ERP API')
    .setDescription(
      configService.get('SWAGGER_DESCRIPTION') ||
        'Enterprise Resource Planning System API',
    )
    .setVersion(configService.get('SWAGGER_VERSION') || '1.0')
    .addTag(configService.get('SWAGGER_TAG') || 'api')
    .addBearerAuth(
      {
        description: 'JWT Authorization header using the Bearer scheme.',
        name: 'Authorization',
        bearerFormat: 'JWT',
        scheme: 'Bearer',
        type: 'http',
        in: 'Header',
      },
      'access-token',
    )
    .addBearerAuth(
      {
        description: 'Admin JWT Authorization header using the Bearer scheme.',
        name: 'Authorization',
        bearerFormat: 'JWT',
        scheme: 'Bearer',
        type: 'http',
        in: 'Header',
      },
      'admin-access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // Prisma shutdown hooks
  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  // Start server
  const port = configService.get('PORT') || 3000;
  await app.listen(port);

  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  logger.log(
    `🏥 Health Check: http://localhost:${port}/${apiPrefix}/${apiVersion}/health`,
  );
}

bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application', error);
  process.exit(1);
});
