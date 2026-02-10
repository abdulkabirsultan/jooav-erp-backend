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

      this.ioredisClient.on('connect', () => {
        this.isConnected = true;
        this.logger.log('Connected to traditional Redis');
      });

      this.ioredisClient.on('error', (err) => {
        this.isConnected = false;
        this.logger.error('Traditional Redis connection error:', err);
      });

      this.ioredisClient.on('close', () => {
        this.isConnected = false;
        this.logger.warn('Traditional Redis connection closed');
      });
    }
  }

  async get<T = string>(key: string): Promise<T | null> {
    try {
      let result: string | null;

      if (this.clientType === 'upstash' && this.upstashClient) {
        result = await this.upstashClient.get(key);
      } else if (this.clientType === 'traditional' && this.ioredisClient) {
        result = await this.ioredisClient.get(key);
      } else {
        throw new Error('No Redis client available');
      }

      if (result === null) return null;

      try {
        return JSON.parse(result) as T;
      } catch {
        return result as unknown as T;
      }
    } catch (error) {
      this.logger.error(`Error getting cache key ${key}:`, error);
      return null;
    }
  }

  async set(
    key: string,
    value: any,
    options?: { ex?: number; px?: number },
  ): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value);

      if (this.clientType === 'upstash' && this.upstashClient) {
        if (options?.ex) {
          await this.upstashClient.setex(key, options.ex, serializedValue);
        } else if (options?.px) {
          await this.upstashClient.psetex(key, options.px, serializedValue);
        } else {
          await this.upstashClient.set(key, serializedValue);
        }
      } else if (this.clientType === 'traditional' && this.ioredisClient) {
        if (options?.ex) {
          await this.ioredisClient.setex(key, options.ex, serializedValue);
        } else if (options?.px) {
          await this.ioredisClient.psetex(key, options.px, serializedValue);
        } else {
          await this.ioredisClient.set(key, serializedValue);
        }
      } else {
        throw new Error('No Redis client available');
      }
    } catch (error) {
      this.logger.error(`Error setting cache key ${key}:`, error);
      throw error;
    }
  }

  async del(key: string | string[]): Promise<number> {
    try {
      let result: number;

      if (this.clientType === 'upstash' && this.upstashClient) {
        if (Array.isArray(key)) {
          result = await this.upstashClient.del(...key);
        } else {
          result = await this.upstashClient.del(key);
        }
      } else if (this.clientType === 'traditional' && this.ioredisClient) {
        if (Array.isArray(key)) {
          result = await this.ioredisClient.del(...key);
        } else {
          result = await this.ioredisClient.del(key);
        }
      } else {
        throw new Error('No Redis client available');
      }

      return result;
    } catch (error) {
      this.logger.error(`Error deleting cache key(s) ${key}:`, error);
      return 0;
    }
  }

  async ping(): Promise<boolean> {
    try {
      if (this.clientType === 'upstash' && this.upstashClient) {
        const result = await this.upstashClient.ping();
        return result === 'PONG';
      } else if (this.clientType === 'traditional' && this.ioredisClient) {
        const result = await this.ioredisClient.ping();
        return result === 'PONG';
      }
      return false;
    } catch (error) {
      this.logger.error('Error pinging Redis:', error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      let result: number;

      if (this.clientType === 'upstash' && this.upstashClient) {
        result = await this.upstashClient.exists(key);
      } else if (this.clientType === 'traditional' && this.ioredisClient) {
        result = await this.ioredisClient.exists(key);
      } else {
        return false;
      }

      return result === 1;
    } catch (error) {
      this.logger.error(`Error checking existence of key ${key}:`, error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      if (this.clientType === 'upstash' && this.upstashClient) {
        return await this.upstashClient.ttl(key);
      } else if (this.clientType === 'traditional' && this.ioredisClient) {
        return await this.ioredisClient.ttl(key);
      }
      return -2;
    } catch (error) {
      this.logger.error(`Error getting TTL for key ${key}:`, error);
      return -2;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      if (this.clientType === 'upstash' && this.upstashClient) {
        return await this.upstashClient.keys(pattern);
      } else if (this.clientType === 'traditional' && this.ioredisClient) {
        return await this.ioredisClient.keys(pattern);
      }
      return [];
    } catch (error) {
      this.logger.error(`Error getting keys with pattern ${pattern}:`, error);
      return [];
    }
  }

  async scan(
    cursor: string | number = 0,
    options?: { match?: string; count?: number },
  ): Promise<{ cursor: string; keys: string[] }> {
    try {
      if (this.clientType === 'upstash' && this.upstashClient) {
        const scanOptions = options || { match: '*', count: 10 };
        const result = await this.upstashClient.scan(cursor, scanOptions);
        return {
          cursor: result[0].toString(),
          keys: Array.isArray(result[1])
            ? result[1].map((item: any) =>
                typeof item === 'string' ? item : item.key,
              )
            : [],
        };
      } else if (this.clientType === 'traditional' && this.ioredisClient) {
        const result = await this.ioredisClient.scan(
          cursor.toString(),
          'MATCH',
          options?.match || '*',
          'COUNT',
          options?.count || 10,
        );
        return {
          cursor: result[0],
          keys: result[1],
        };
      }
      return { cursor: '0', keys: [] };
    } catch (error) {
      this.logger.error('Error scanning Redis keys:', error);
      return { cursor: '0', keys: [] };
    }
  }

  async flushall(): Promise<void> {
    try {
      if (this.clientType === 'upstash' && this.upstashClient) {
        await this.upstashClient.flushall();
      } else if (this.clientType === 'traditional' && this.ioredisClient) {
        await this.ioredisClient.flushall();
      }
      this.logger.log('Cache flushed successfully');
    } catch (error) {
      this.logger.error('Error flushing cache:', error);
      throw error;
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
        const pingResult = await this.ping();
        return {
          type: 'upstash',
          connected: pingResult,
          environment: process.env.NODE_ENV || 'development',
        };
      } else if (this.ioredisClient) {
        return {
          connected: this.isConnected,
          status: this.ioredisClient.status,
          host: this.ioredisClient.options.host,
          port: this.ioredisClient.options.port,
          db: this.ioredisClient.options.db,
          environment: process.env.NODE_ENV || 'development',
        };
      }
    } catch (error) {
      this.logger.error('Error getting connection info:', error);
      return { connected: false, error: error.message };
    }
  }

  // Tag-based cache methods for performance optimization

  /**
   * Set a cache value with associated tags for efficient invalidation
   */
  async setWithTags(
    key: string,
    value: any,
    tags: string[],
    ttl?: number,
  ): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value);
      const actualTtl = ttl || 3600; // Default 1 hour

      if (this.clientType === 'upstash' && this.upstashClient) {
        // Set the main cache value
        await this.upstashClient.setex(key, actualTtl, serializedValue);

        // Add key to tag sets
        const tagOperations = tags.map((tag) =>
          this.upstashClient!.sadd(`tag:${tag}`, key),
        );
        await Promise.all(tagOperations);

        // Set expiration for tag sets (slightly longer than cache TTL)
        const tagTtlOperations = tags.map((tag) =>
          this.upstashClient!.expire(`tag:${tag}`, actualTtl + 300),
        );
        await Promise.all(tagTtlOperations);
      } else if (this.clientType === 'traditional' && this.ioredisClient) {
        // Set the main cache value
        await this.ioredisClient.setex(key, actualTtl, serializedValue);

        // Add key to tag sets
        const tagOperations = tags.map((tag) =>
          this.ioredisClient!.sadd(`tag:${tag}`, key),
        );
        await Promise.all(tagOperations);

        // Set expiration for tag sets (slightly longer than cache TTL)
        const tagTtlOperations = tags.map((tag) =>
          this.ioredisClient!.expire(`tag:${tag}`, actualTtl + 300),
        );
        await Promise.all(tagTtlOperations);
      }

      this.logger.debug(`Cache set with tags: ${key} [${tags.join(', ')}]`);
    } catch (error) {
      this.logger.error(`Error setting cache with tags for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Invalidate all cache entries associated with a specific tag
   */
  async invalidateByTag(tag: string): Promise<number> {
    try {
      let deletedCount = 0;

      if (this.clientType === 'upstash' && this.upstashClient) {
        const keys = await this.upstashClient.smembers(`tag:${tag}`);
        if (keys.length > 0) {
          await this.upstashClient.del(...keys);
          await this.upstashClient.del(`tag:${tag}`);
          deletedCount = keys.length;
        }
      } else if (this.clientType === 'traditional' && this.ioredisClient) {
        const keys = await this.ioredisClient.smembers(`tag:${tag}`);
        if (keys.length > 0) {
          await this.ioredisClient.del(...keys);
          await this.ioredisClient.del(`tag:${tag}`);
          deletedCount = keys.length;
        }
      }

      this.logger.debug(
        `Invalidated ${deletedCount} cache entries with tag: ${tag}`,
      );
      return deletedCount;
    } catch (error) {
      this.logger.error(`Error invalidating cache by tag ${tag}:`, error);
      return 0;
    }
  }

  /**
   * Invalidate all cache entries associated with multiple tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    let totalDeleted = 0;
    for (const tag of tags) {
      const deleted = await this.invalidateByTag(tag);
      totalDeleted += deleted;
    }
    return totalDeleted;
  }

  /**
   * Get all cache keys associated with a specific tag
   */
  async getKeysByTag(tag: string): Promise<string[]> {
    try {
      if (this.clientType === 'upstash' && this.upstashClient) {
        return await this.upstashClient.smembers(`tag:${tag}`);
      } else if (this.clientType === 'traditional' && this.ioredisClient) {
        return await this.ioredisClient.smembers(`tag:${tag}`);
      }
      return [];
    } catch (error) {
      this.logger.error(`Error getting keys by tag ${tag}:`, error);
      return [];
    }
  }
}
