import {
  utilities as nestWinstonModuleUtilities,
  WinstonModule,
} from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { ConfigService } from '@nestjs/config';

export class LoggerService {
  static createWinstonLogger(configService: ConfigService): winston.Logger {
    const logLevel = configService.get('logging.level', 'info');
    const logFormat = configService.get('logging.format', 'json');
    const nodeEnv = configService.get('app.nodeEnv', 'development');

    const LEVEL_COLORS: Record<string, string> = {
      error: '\x1b[31m', // red
      warn:  '\x1b[33m', // yellow
      info:  '\x1b[32m', // green
      debug: '\x1b[36m', // cyan
      verbose: '\x1b[35m', // magenta
    };
    const DIM = '\x1b[2m';
    const BOLD = '\x1b[1m';
    const RESET = '\x1b[0m';
    const CYAN = '\x1b[36m';
    const GRAY = '\x1b[90m';

    const prettyDevFormat = winston.format.printf(
      ({ timestamp, level, message, context, ms, stack, ...meta }) => {
        const rawLevel = level.replace(/\u001b\[.*?m/g, '').toUpperCase().padEnd(5);
        const color = LEVEL_COLORS[level.replace(/\u001b\[.*?m/g, '')] || RESET;
        const time = DIM + String(timestamp).split('T')[1]?.replace('Z', '') + RESET;
        const ctx = context ? `${CYAN}${BOLD}[${context}]${RESET}` : '';
        const elapsed = ms ? ` ${GRAY}${ms}${RESET}` : '';
        const levelBadge = `${color}${BOLD}${rawLevel}${RESET}`;

        let out = `${time} ${levelBadge} ${ctx} ${message}${elapsed}`;

        if (stack) {
          out += `\n${GRAY}${stack}${RESET}`;
        } else if (Object.keys(meta).length > 0) {
          const filtered = Object.fromEntries(
            Object.entries(meta).filter(([k]) => !['splat', 'service'].includes(k))
          );
          if (Object.keys(filtered).length > 0) {
            out += `\n${GRAY}${JSON.stringify(filtered, null, 2)}${RESET}`;
          }
        }
        return out;
      },
    );

    // Define log format based on environment
    const loggerFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.ms(),
      winston.format.errors({ stack: true }),
      nodeEnv === 'development'
        ? prettyDevFormat
        : winston.format.combine(
            winston.format.json(),
            winston.format.printf(
              ({ timestamp, level, message, context, trace, ...meta }) => {
                return JSON.stringify({
                  timestamp,
                  level: level.replace(/\u001b\[.*?m/g, ''), // Remove ANSI colors
                  context: context || 'Application',
                  message,
                  ...(trace ? { trace } : {}),
                  ...meta,
                });
              },
            ),
          ),
    );

    const transports: winston.transport[] = [
      // Console transport
      new winston.transports.Console({
        level: logLevel,
        format: loggerFormat,
      }),
    ];

    // File transports for production
    if (nodeEnv === 'production') {
      // General application logs
      transports.push(
        new winston.transports.DailyRotateFile({
          filename: configService.get(
            'logging.filename',
            'logs/app-%DATE%.log',
          ),
          datePattern: configService.get('logging.datePattern', 'YYYY-MM-DD'),
          maxSize: configService.get('logging.maxSize', '20m'),
          maxFiles: configService.get('logging.maxFiles', 14),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
      );

      // Error logs
      transports.push(
        new winston.transports.DailyRotateFile({
          filename: configService.get(
            'logging.errorFilename',
            'logs/error-%DATE%.log',
          ),
          datePattern: configService.get('logging.datePattern', 'YYYY-MM-DD'),
          level: 'error',
          maxSize: configService.get('logging.maxSize', '20m'),
          maxFiles: configService.get('logging.maxFiles', 14),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
      );
    }

    return winston.createLogger({
      level: logLevel,
      format: loggerFormat,
      transports,
      // Don't exit on handled exceptions
      exitOnError: false,
      // Handle uncaught exceptions
      exceptionHandlers: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json(),
          ),
        }),
      ],
      // Handle unhandled promise rejections
      rejectionHandlers: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json(),
          ),
        }),
      ],
    });
  }

  static createNestWinstonLogger(configService: ConfigService) {
    return WinstonModule.createLogger({
      instance: LoggerService.createWinstonLogger(configService),
    });
  }
}

// Custom logger for specific use cases
export class AppLogger {
  private static instance: winston.Logger;

  static getInstance(configService?: ConfigService): winston.Logger {
    if (!AppLogger.instance && configService) {
      AppLogger.instance = LoggerService.createWinstonLogger(configService);
    }
    return AppLogger.instance;
  }

  static log(level: string, message: string, context?: string, meta?: any) {
    if (AppLogger.instance) {
      AppLogger.instance.log(level, message, { context, ...meta });
    }
  }

  static error(message: string, trace?: string, context?: string, meta?: any) {
    if (AppLogger.instance) {
      AppLogger.instance.error(message, { context, trace, ...meta });
    }
  }

  static warn(message: string, context?: string, meta?: any) {
    if (AppLogger.instance) {
      AppLogger.instance.warn(message, { context, ...meta });
    }
  }

  static info(message: string, context?: string, meta?: any) {
    if (AppLogger.instance) {
      AppLogger.instance.info(message, { context, ...meta });
    }
  }

  static debug(message: string, context?: string, meta?: any) {
    if (AppLogger.instance) {
      AppLogger.instance.debug(message, { context, ...meta });
    }
  }

  static verbose(message: string, context?: string, meta?: any) {
    if (AppLogger.instance) {
      AppLogger.instance.verbose(message, { context, ...meta });
    }
  }
}
