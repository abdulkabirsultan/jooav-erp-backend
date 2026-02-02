import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';
import IORedis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private upstashClient?: Redis;
  private ioredisClient?: IORedis;
  private clientType: 'upstash' | 'traditional';
  private isConnected = false;

  constructor(private configService: ConfigService) {
    this.initializeClient();
  }

  async onModuleInit() {
    await this.validateConnection();
  }

  private initializeClient() {
    const redisConfig = this.configService.get('redis');
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (redisConfig?.type === 'upstash' && redisConfig.upstash) {
      // Initialize Upstash Redis client
      this.upstashClient = new Redis({
        url: redisConfig.upstash.url,
        token: redisConfig.upstash.token,
      });
      this.clientType = 'upstash';
      this.logger.log(
        `Initialized Upstash Redis client for ${nodeEnv} environment`,
      );
    } else {
      // Initialize traditional Redis client
      const options = {
        host: redisConfig?.host || 'localhost',
        port: redisConfig?.port || 6379,
        password: redisConfig?.password,
        retryDelayOnFailover: redisConfig?.retryDelay || 1000,
        maxRetriesPerRequest: redisConfig?.retryAttempts || 3,
        lazyConnect: true,
      };

      this.ioredisClient = new IORedis(options);
      this.clientType = 'traditional';
      this.logger.log(
        `Initialized traditional Redis client for ${nodeEnv} environment (${options.host}:${options.port})`,
      );

      // Handle connection events
      this.ioredisClient.on('connect', () => {
        this.logger.log('Connected to traditional Redis');
        this.isConnected = true;
      });

      this.ioredisClient.on('ready', () => {
        this.logger.log('Traditional Redis client is ready');
        this.isConnected = true;
      });

      this.ioredisClient.on('error', (error) => {
        this.logger.error('Redis connection error:', error);
        this.isConnected = false;
      });

      this.ioredisClient.on('close', () => {
        this.logger.warn('Redis connection closed');
        this.isConnected = false;
      });
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      if (this.clientType === 'upstash' && this.upstashClient) {
        return await this.upstashClient.get(key);
      } else if (this.ioredisClient) {
        return await this.ioredisClient.get(key);
      }
      return null;
    } catch (error) {
      this.logger.error(`Error getting key ${key}:`, error);
      return null;
    }
  }

  async set(
    key: string,
    value: string,
    options?: { ex?: number; px?: number; nx?: boolean; xx?: boolean },
  ): Promise<boolean> {
    try {
      if (this.clientType === 'upstash' && this.upstashClient) {
        if (options?.ex) {
          const result = await this.upstashClient.setex(key, options.ex, value);
          return result === 'OK';
        } else if (options?.px) {
          const result = await this.upstashClient.psetex(
            key,
            options.px,
            value,
          );
          return result === 'OK';
        } else {
          const result = await this.upstashClient.set(key, value);
          return result === 'OK';
        }
      } else if (this.ioredisClient) {
        if (options?.ex) {
          const result = await this.ioredisClient.setex(key, options.ex, value);
          return result === 'OK';
        } else if (options?.px) {
          const result = await this.ioredisClient.psetex(
            key,
            options.px,
            value,
          );
          return result === 'OK';
        } else if (options?.nx) {
          const result = await this.ioredisClient.setnx(key, value);
          return result === 1;
        } else {
          const result = await this.ioredisClient.set(key, value);
          return result === 'OK';
        }
      }
      return false;
    } catch (error) {
      this.logger.error(`Error setting key ${key}:`, error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      if (this.clientType === 'upstash' && this.upstashClient) {
        const result = await this.upstashClient.del(key);
        return result > 0;
      } else if (this.ioredisClient) {
        const result = await this.ioredisClient.del(key);
        return result > 0;
      }
      return false;
    } catch (error) {
      this.logger.error(`Error deleting key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (this.clientType === 'upstash' && this.upstashClient) {
        const result = await this.upstashClient.exists(key);
        return result > 0;
      } else if (this.ioredisClient) {
        const result = await this.ioredisClient.exists(key);
        return result > 0;
      }
      return false;
    } catch (error) {
      this.logger.error(`Error checking existence of key ${key}:`, error);
      return false;
    }
  }

  async setex(key: string, seconds: number, value: string): Promise<boolean> {
    return this.set(key, value, { ex: seconds });
  }

  async ttl(key: string): Promise<number> {
    try {
      if (this.clientType === 'upstash' && this.upstashClient) {
        return await this.upstashClient.ttl(key);
      } else if (this.ioredisClient) {
        return await this.ioredisClient.ttl(key);
      }
      return -1;
    } catch (error) {
      this.logger.error(`Error getting TTL for key ${key}:`, error);
      return -1;
    }
  }

  async flushall(): Promise<boolean> {
    try {
      if (this.clientType === 'upstash' && this.upstashClient) {
        await this.upstashClient.flushall();
        return true;
      } else if (this.ioredisClient) {
        await this.ioredisClient.flushall();
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error('Error flushing Redis:', error);
      return false;
    }
  }

  async ping(): Promise<boolean> {
    try {
      if (this.clientType === 'upstash' && this.upstashClient) {
        const result = await this.upstashClient.ping();
        return result === 'PONG';
      } else if (this.ioredisClient) {
        const result = await this.ioredisClient.ping();
        return result === 'PONG';
      }
      return false;
    } catch (error) {
      this.logger.error('Error pinging Redis:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.ioredisClient) {
        await this.ioredisClient.disconnect();
        this.logger.log('Disconnected from traditional Redis');
      }
      // Upstash doesn't need explicit disconnection
      this.isConnected = false;
    } catch (error) {
      this.logger.error('Error disconnecting from Redis:', error);
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      this.logger.log(`Validating ${this.clientType} Redis connection...`);

      const pingResult = await this.ping();

      if (pingResult) {
        this.isConnected = true;
        this.logger.log(
          `✅ ${this.clientType === 'upstash' ? 'Upstash' : 'Traditional'} Redis connection validated successfully`,
        );

        // Test basic operations
        await this.testBasicOperations();

        return true;
      } else {
        this.isConnected = false;
        this.logger.error(
          `❌ ${this.clientType === 'upstash' ? 'Upstash' : 'Traditional'} Redis connection validation failed`,
        );
        return false;
      }
    } catch (error) {
      this.isConnected = false;
      this.logger.error(`❌ Redis connection validation error:`, error);
      return false;
    }
  }

  private async testBasicOperations(): Promise<void> {
    const testKey = 'cache:health:test';
    const testValue = `test-${Date.now()}`;

    try {
      // Test SET operation
      await this.set(testKey, testValue, { ex: 10 });

      // Test GET operation
      const retrievedValue = await this.get(testKey);

      if (retrievedValue === testValue) {
        this.logger.log(
          '✅ Basic Redis operations (SET/GET) working correctly',
        );
      } else {
        this.logger.warn(
          '⚠️ Redis SET/GET operation returned unexpected value',
        );
      }

      // Cleanup
      await this.del(testKey);
    } catch (error) {
      this.logger.error('❌ Redis basic operations test failed:', error);
      throw error;
    }
  }

  getConnectionStatus(): {
    connected: boolean;
    type: string;
    environment: string;
  } {
    return {
      connected: this.isConnected,
      type: this.clientType,
      environment: process.env.NODE_ENV || 'development',
    };
  }

  async getConnectionInfo(): Promise<any> {
    try {
      if (this.clientType === 'upstash' && this.upstashClient) {
        // For Upstash, we can only check if ping works
        const pingResult = await this.ping();
        return {
          type: 'upstash',
          connected: pingResult,
          url: process.env.UPSTASH_REDIS_REST_URL
            ? 'configured'
            : 'not configured',
        };
      } else if (this.ioredisClient) {
        const info = {
          type: 'traditional',
          connected: this.isConnected,
          status: this.ioredisClient.status,
          host: this.ioredisClient.options.host,
          port: this.ioredisClient.options.port,
          db: this.ioredisClient.options.db,
        };
        return info;
      }
      return { type: 'none', connected: false };
    } catch (error) {
      this.logger.error('Error getting connection info:', error);
      return { type: this.clientType, connected: false, error: error.message };
    }
  }
}
