/**
 * Production Redis Debug Script
 * Run this script in production to diagnose Redis timeout issues
 */

const Redis = require('ioredis');
require('dotenv').config();

async function testRedisConnection() {
  console.log('🔍 Redis Production Diagnostic Tool');
  console.log('=====================================');

  // Get environment variables
  const env = {
    NODE_ENV: process.env.NODE_ENV,
    REDIS_URL: process.env.REDIS_URL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN
      ? '[SET]'
      : '[NOT SET]',
  };

  console.log('\n📊 Environment Configuration:');
  console.table(env);

  const connectionUrl =
    process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
  if (!connectionUrl) {
    console.error('\n❌ Missing Redis environment variables.');
    console.error(
      'Set REDIS_URL (recommended) or UPSTASH_REDIS_REST_URL before running this script.',
    );
    console.error(
      'Example: REDIS_URL="rediss://default:<password>@<host>:6379" node debug-redis-production.js',
    );
    process.exit(1);
  }

  if (connectionUrl.startsWith('https://')) {
    console.error('\n❌ Invalid Redis URL protocol for ioredis.');
    console.error(
      'You are using an HTTPS REST URL. Bull/ioredis needs a Redis socket URL (redis:// or rediss://).',
    );
    console.error(
      'Use your Upstash Redis connection string, not the REST URL.',
    );
    process.exit(1);
  }

  // Test different Redis configurations
  const configs = [
    {
      name: 'Current Production Config (Updated)',
      config: {
        ...(() => {
          const u = new URL(connectionUrl);
          return {
            host: u.hostname,
            port: Number(u.port || 6379),
            username: u.username ? decodeURIComponent(u.username) : undefined,
            password: u.password ? decodeURIComponent(u.password) : undefined,
            tls: u.protocol === 'rediss:' ? {} : undefined,
          };
        })(),
        maxRetriesPerRequest: null,
        retryDelayOnFailover: 1000,
        enableReadyCheck: false,
        lazyConnect: true,
        keepAlive: 30000,
        family: 4,
        connectTimeout: 60000,
        commandTimeout: 15000,
      },
    },
    {
      name: 'Old Production Config (For Comparison)',
      config: {
        ...(() => {
          const u = new URL(connectionUrl);
          return {
            host: u.hostname,
            port: Number(u.port || 6379),
            username: u.username ? decodeURIComponent(u.username) : undefined,
            password: u.password ? decodeURIComponent(u.password) : undefined,
            tls: u.protocol === 'rediss:' ? {} : undefined,
          };
        })(),
        maxRetriesPerRequest: null,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        lazyConnect: true,
        keepAlive: 30000,
        family: 4,
        connectTimeout: 60000,
        commandTimeout: 5000,
      },
    },
  ];

  for (const { name, config } of configs) {
    console.log(`\n🧪 Testing: ${name}`);
    console.log('─'.repeat(50));

    let redis;
    try {
      const startTime = Date.now();
      redis = new Redis(config);

      // Test basic connectivity
      console.log('⏳ Connecting to Redis...');
      await redis.ping();
      const connectTime = Date.now() - startTime;
      console.log(`✅ Connected in ${connectTime}ms`);

      // Test command performance
      console.log('⏳ Testing Redis commands...');

      const tests = [
        { name: 'SET', cmd: () => redis.set('test:key', 'test-value') },
        { name: 'GET', cmd: () => redis.get('test:key') },
        { name: 'DEL', cmd: () => redis.del('test:key') },
        { name: 'KEYS', cmd: () => redis.keys('*') },
      ];

      for (const test of tests) {
        try {
          const start = Date.now();
          await test.cmd();
          const duration = Date.now() - start;
          console.log(`  ✅ ${test.name}: ${duration}ms`);
        } catch (error) {
          console.log(`  ❌ ${test.name}: ${error.message}`);
        }
      }

      // Test under load
      console.log('⏳ Testing under simulated load...');
      const loadTests = Array.from({ length: 10 }, (_, i) =>
        redis.set(`load:test:${i}`, `value-${i}`),
      );

      const loadStart = Date.now();
      await Promise.all(loadTests);
      const loadDuration = Date.now() - loadStart;
      console.log(`✅ 10 concurrent operations: ${loadDuration}ms`);
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
      if (error.code) console.log(`   Code: ${error.code}`);
      if (error.syscall) console.log(`   Syscall: ${error.syscall}`);
    } finally {
      if (redis) {
        await redis.quit();
        console.log('🔌 Connection closed');
      }
    }
  }

  console.log('\n🔍 Network Diagnostics:');
  console.log('─'.repeat(30));

  // Parse Redis URL for diagnostics
  if (process.env.REDIS_URL) {
    try {
      const url = new URL(process.env.REDIS_URL);
      console.log(`📡 Redis Host: ${url.hostname}`);
      console.log(`🔌 Redis Port: ${url.port}`);
      console.log(`🔒 SSL: ${url.protocol === 'rediss:'}`);

      // Test DNS resolution
      const dns = require('dns').promises;
      try {
        const addresses = await dns.lookup(url.hostname);
        console.log(`🌐 DNS Resolution: ${addresses.address}`);
      } catch (dnsError) {
        console.log(`❌ DNS Error: ${dnsError.message}`);
      }
    } catch (parseError) {
      console.log(`❌ URL Parse Error: ${parseError.message}`);
    }
  }

  console.log('\n💡 Recommendations:');
  console.log('─'.repeat(20));
  console.log('1. If timeouts persist, check Upstash Redis limits');
  console.log('2. Monitor network latency between Render and Upstash');
  console.log('3. Consider implementing circuit breaker pattern');
  console.log('4. Add Redis connection pooling');
  console.log('5. Check for memory/CPU limits on Render');
}

// Run the diagnostic
testRedisConnection().catch(console.error);
