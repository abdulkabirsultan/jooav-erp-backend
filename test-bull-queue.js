/**
 * Bull Queue Diagnostic Script with Upstash Redis
 *
 * This script tests Bull queue functionality with your production Redis (Upstash)
 * Run: node test-bull-queue.js
 */

const Queue = require('bull');
require('dotenv').config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testBullQueue() {
  log('\n🔍 Bull Queue + Upstash Redis Diagnostic Tool', colors.blue);
  log('='.repeat(60), colors.blue);

  // Get environment variables
  const env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    REDIS_URL: process.env.REDIS_URL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN
      ? '[SET]'
      : '[NOT SET]',
    EMAIL_ENABLED: process.env.EMAIL_ENABLED,
    EMAIL_QUEUE_FALLBACK_ENABLED:
      process.env.EMAIL_QUEUE_FALLBACK_ENABLED || 'true',
  };

  log('\n📊 Environment Configuration:', colors.yellow);
  console.table(env);

  // Build Redis connection config
  const buildRedisConnection = () => {
    const directRedisUrl = process.env.REDIS_URL?.trim();
    const restRedisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

    // Try direct Redis URL first (redis:// or rediss://)
    if (
      directRedisUrl &&
      (directRedisUrl.startsWith('redis://') ||
        directRedisUrl.startsWith('rediss://'))
    ) {
      const parsedRedisUrl = new URL(directRedisUrl);
      const isTls = parsedRedisUrl.protocol === 'rediss:';

      return {
        host: parsedRedisUrl.hostname,
        port: parsedRedisUrl.port ? parseInt(parsedRedisUrl.port, 10) : 6379,
        username: parsedRedisUrl.username
          ? decodeURIComponent(parsedRedisUrl.username)
          : undefined,
        password: parsedRedisUrl.password
          ? decodeURIComponent(parsedRedisUrl.password)
          : undefined,
        tls: isTls ? {} : undefined,
      };
    }

    // Fallback to REST URL conversion
    if (
      restRedisUrl &&
      (restRedisUrl.startsWith('https://') ||
        restRedisUrl.startsWith('http://')) &&
      upstashToken
    ) {
      const parsedUpstashUrl = new URL(restRedisUrl);
      return {
        host: parsedUpstashUrl.hostname,
        port: 6379,
        username: 'default',
        password: upstashToken,
        tls: {},
      };
    }

    return null;
  };

  const redisConnection = buildRedisConnection();

  if (!redisConnection) {
    log('\n❌ Invalid Redis configuration!', colors.red);
    log(
      'Set REDIS_URL (redis:// or rediss://) or UPSTASH_REDIS_REST_URL + TOKEN',
      colors.red,
    );
    process.exit(1);
  }

  log('\n📡 Redis Connection Config:', colors.yellow);
  console.log({
    host: redisConnection.host,
    port: redisConnection.port,
    username: redisConnection.username || 'default',
    password: redisConnection.password ? '[HIDDEN]' : '[NONE]',
    tls: redisConnection.tls ? 'enabled' : 'disabled',
  });

  // Create Bull queue with production config
  const redisOptions = {
    host: redisConnection.host,
    port: redisConnection.port,
    username: redisConnection.username,
    password: redisConnection.password,
    maxRetriesPerRequest: null,
    retryDelayOnFailover: 1000,
    enableReadyCheck: false,
    lazyConnect: true,
    keepAlive: 30000,
    family: 4,
    connectTimeout: 60000,
    commandTimeout: 15000,
    tls: redisConnection.tls,
  };

  log('\n🚀 Creating Bull test queue...', colors.blue);

  const testQueue = new Queue('test-email-queue', {
    redis: redisOptions,
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      timeout: 20000,
      removeOnComplete: 10,
      removeOnFail: 5,
    },
    settings: {
      stalledInterval: 30000,
      maxStalledCount: 1,
      retryProcessDelay: 10000,
    },
  });

  let processedJobs = 0;
  let failedJobs = 0;

  // Set up queue event listeners
  testQueue.on('ready', () => {
    log('\n✅ Queue is ready and connected to Redis', colors.green);
  });

  testQueue.on('error', (error) => {
    log(`\n❌ Queue error: ${error.message}`, colors.red);
  });

  testQueue.on('active', (job) => {
    log(`\n🔄 Job ${job.id} is now active (being processed)`, colors.yellow);
  });

  testQueue.on('completed', (job, result) => {
    processedJobs++;
    log(`\n✅ Job ${job.id} completed successfully`, colors.green);
    log(`   Result: ${JSON.stringify(result)}`, colors.green);
  });

  testQueue.on('failed', (job, error) => {
    failedJobs++;
    log(`\n❌ Job ${job.id} failed: ${error.message}`, colors.red);
  });

  testQueue.on('stalled', (job) => {
    log(
      `\n⚠️  Job ${job.id} stalled (worker died or took too long)`,
      colors.yellow,
    );
  });

  testQueue.on('waiting', (jobId) => {
    log(`\n⏳ Job ${jobId} is waiting in queue`, colors.blue);
  });

  // Wait for queue to be ready
  await testQueue.isReady();

  try {
    // Test 1: Clean existing jobs
    log('\n🧹 Cleaning existing jobs...', colors.blue);
    await testQueue.clean(0, 'completed');
    await testQueue.clean(0, 'failed');
    await testQueue.clean(0, 'wait');
    await testQueue.clean(0, 'active');
    await testQueue.clean(0, 'delayed');
    log('✅ Queue cleaned', colors.green);

    // Test 2: Check queue counts
    log('\n📊 Current Queue Status:', colors.yellow);
    const counts = await testQueue.getJobCounts();
    console.table(counts);

    // Test 3: Add a test job
    log('\n➕ Adding test job to queue...', colors.blue);
    const job = await testQueue.add(
      'test-email',
      {
        to: 'test@example.com',
        template: 'welcome',
        message: 'This is a test email job',
      },
      {
        priority: 10,
        attempts: 2,
      },
    );
    log(`✅ Job added with ID: ${job.id}`, colors.green);

    // Test 4: Check if job is in queue
    log('\n🔍 Verifying job is in queue...', colors.blue);
    const waitingJobs = await testQueue.getWaiting();
    log(`   Waiting jobs: ${waitingJobs.length}`, colors.yellow);

    if (waitingJobs.length > 0) {
      log('✅ Job is successfully in the queue!', colors.green);
    } else {
      log(
        '⚠️  Job not found in waiting queue (might have been processed)',
        colors.yellow,
      );
    }

    // Test 5: Set up a processor to handle the job
    log('\n🔧 Setting up processor to handle jobs...', colors.blue);

    testQueue.process('test-email', async (job) => {
      log(`\n🔄 Processor picked up job ${job.id}`, colors.yellow);
      log(`   Job data: ${JSON.stringify(job.data)}`, colors.yellow);

      // Simulate processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return { success: true, processedAt: new Date().toISOString() };
    });

    log('✅ Processor registered', colors.green);

    // Test 6: Add another job to see processor in action
    log('\n➕ Adding another job to test processor...', colors.blue);
    const job2 = await testQueue.add('test-email', {
      to: 'processor-test@example.com',
      template: 'password-reset',
      message: 'Testing processor functionality',
    });
    log(`✅ Job added with ID: ${job2.id}`, colors.green);

    // Wait for processing
    log('\n⏳ Waiting for jobs to be processed (10 seconds)...', colors.blue);
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Test 7: Final status check
    log('\n📊 Final Queue Status:', colors.yellow);
    const finalCounts = await testQueue.getJobCounts();
    console.table(finalCounts);

    // Test 8: Check for issues
    log('\n🔍 Checking for issues:', colors.yellow);
    const activeJobs = await testQueue.getActive();
    const failedJobsList = await testQueue.getFailed();
    const waitingJobsList = await testQueue.getWaiting();

    log(`   Active jobs: ${activeJobs.length}`, colors.blue);
    log(
      `   Waiting jobs: ${waitingJobsList.length}`,
      waitingJobsList.length > 0 ? colors.yellow : colors.green,
    );
    log(
      `   Failed jobs: ${failedJobsList.length}`,
      failedJobsList.length > 0 ? colors.red : colors.green,
    );

    if (waitingJobsList.length > 0 && processedJobs === 0) {
      log('\n⚠️  CRITICAL: Jobs stuck in waiting state!', colors.red);
      log('Jobs were added but processor never picked them up.', colors.red);
      log('\nPossible causes:', colors.yellow);
      log(
        '  1. 🔴 Processor not actually running (most likely)',
        colors.yellow,
      );
      log('  2. 🔴 Redis connection issue preventing BRPOP', colors.yellow);
      log('  3. 🔴 Queue name mismatch', colors.yellow);
      log('  4. 🔴 Bull blocking commands timing out', colors.yellow);

      log('\n🔧 Testing Redis blocking operations...', colors.blue);
      try {
        const Redis = require('ioredis');
        const testRedis = new Redis(redisOptions);
        await testRedis.ping();
        log('   ✅ Redis PING works', colors.green);

        // Test BLPOP (blocking pop) - this is what Bull uses
        await testRedis.lpush('test:blocking', 'value');
        const result = await testRedis.blpop('test:blocking', 1);
        log('   ✅ Redis BLPOP works', colors.green);
        await testRedis.quit();
      } catch (blockError) {
        log(
          `   ❌ Redis blocking operations failed: ${blockError.message}`,
          colors.red,
        );
        log(
          '   This is likely why Bull workers cannot receive jobs!',
          colors.red,
        );
      }
    }

    if (failedJobsList.length > 0) {
      log('\n❌ Failed jobs found:', colors.red);
      for (const failedJob of failedJobsList.slice(0, 3)) {
        log(`   Job ${failedJob.id}: ${failedJob.failedReason}`, colors.red);
      }
    }

    if (failedJobsList.length > 0) {
      log('\n❌ Failed jobs found:', colors.red);
      for (const failedJob of failedJobsList.slice(0, 3)) {
        log(`   Job ${failedJob.id}: ${failedJob.failedReason}`, colors.red);
      }
    }

    // Summary
    log('\n📋 Test Summary:', colors.blue);
    log('='.repeat(60), colors.blue);
    log(`✅ Jobs processed: ${processedJobs}`, colors.green);
    log(
      `❌ Jobs failed: ${failedJobs}`,
      failedJobs > 0 ? colors.red : colors.green,
    );
    log(`⏳ Jobs waiting: ${finalCounts.waiting}`, colors.yellow);
    log(`🔄 Jobs active: ${finalCounts.active}`, colors.yellow);
    log(`✅ Jobs completed: ${finalCounts.completed}`, colors.green);

    if (processedJobs > 0) {
      log(
        '\n🎉 SUCCESS! Bull queue is working with your Redis connection!',
        colors.green,
      );
      log(
        'Your application should be able to process email jobs.',
        colors.green,
      );
    } else if (finalCounts.waiting > 0) {
      log(
        '\n❌ CRITICAL ISSUE: Jobs are queuing but NOT being processed!',
        colors.red,
      );
      log('\n📋 This is EXACTLY your production issue!', colors.yellow);
      log('\nRoot Cause Analysis:', colors.yellow);
      log('  1. ✅ Redis connection works (jobs can be added)', colors.green);
      log('  2. ❌ Bull workers cannot retrieve jobs from queue', colors.red);
      log('\nMost Likely Causes:', colors.yellow);
      log(
        '  🔴 Upstash Redis blocking commands (BLPOP/BRPOPLPUSH) may be restricted',
        colors.yellow,
      );
      log('  🔴 Redis timeout on blocking operations', colors.yellow);
      log(
        '  🔴 Connection pooling issues with long-lived connections',
        colors.yellow,
      );
      log('\nRecommended Solutions:', colors.blue);
      log(
        '  1. Enable EMAIL_QUEUE_FALLBACK_ENABLED=false to force direct send',
        colors.blue,
      );
      log(
        '  2. Use a different Redis provider (Redis Labs, AWS ElastiCache)',
        colors.blue,
      );
      log('  3. Implement a polling-based queue instead of Bull', colors.blue);
      log(
        '  4. Contact Upstash support about blocking command limitations',
        colors.blue,
      );
    }

    // Cleanup
    log('\n🧹 Cleaning up test queue...', colors.blue);
    await testQueue.close();
    log('✅ Queue closed', colors.green);
  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, colors.red);
    console.error(error);
  }

  log('\n✅ Diagnostic complete!', colors.blue);
  log('='.repeat(60), colors.blue);
  process.exit(0);
}

// Run the test
testBullQueue().catch((error) => {
  log(`\n❌ Fatal error: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});
