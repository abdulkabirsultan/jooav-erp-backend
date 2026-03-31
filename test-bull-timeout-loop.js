/**
 * Bull Queue Timeout Loop Detection Test
 *
 * This script tests whether Bull queue workers enter a timeout loop
 * after processing jobs. It monitors for "Command timed out" errors
 * and validates that the queue operates cleanly.
 *
 * Success criteria:
 * 1. Jobs are added to queue successfully
 * 2. Jobs are processed successfully
 * 3. NO "Command timed out" errors occur after job completion
 * 4. Worker continues to wait for new jobs without errors
 */

const Queue = require('bull');
const Redis = require('ioredis');
require('dotenv').config();

// Configuration
const TEST_DURATION = 60000; // Monitor for 60 seconds after job completes
const JOB_COUNT = 3; // Number of test jobs to process

// Tracking
let timeoutErrorCount = 0;
let jobsCompleted = 0;
let jobsProcessed = [];
let testStartTime = Date.now();
let lastJobCompletionTime = null;
let monitoringInterval = null;

// Parse Redis URL
function parseRedisUrl(url) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}

// Redis configuration with commandTimeout: 0
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error('❌ REDIS_URL not found in environment');
  process.exit(1);
}

const redisConfig = parseRedisUrl(redisUrl);
const bullRedisConfig = {
  ...redisConfig,
  maxRetriesPerRequest: null,
  retryDelayOnFailover: 1000,
  enableReadyCheck: false,
  lazyConnect: false,
  keepAlive: 30000,
  family: 4,
  connectTimeout: 60000,
  // CRITICAL: Must disable commandTimeout for Bull's blocking operations
  // Setting to undefined/null doesn't work, must explicitly set high value
  commandTimeout: 300000, // 5 minutes - effectively no timeout for blocking ops
};

console.log('🔧 Test Configuration:');
console.log(`   Redis Host: ${redisConfig.host}:${redisConfig.port}`);
console.log(`   TLS: ${redisConfig.tls ? 'enabled' : 'disabled'}`);
console.log(
  `   commandTimeout: ${bullRedisConfig.commandTimeout} (0 = disabled)`,
);
console.log(`   Test Duration: ${TEST_DURATION / 1000}s after last job`);
console.log(`   Jobs to Process: ${JOB_COUNT}`);
console.log('');

// Create queue with timeout detection
const testQueue = new Queue('timeout-test', {
  redis: bullRedisConfig,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: false,
    removeOnFail: false,
  },
});

// Monitor Redis errors
testQueue.on('error', (error) => {
  const errorMsg = error.message || String(error);
  console.error(`❌ Queue error: ${errorMsg}`);

  if (errorMsg.includes('Command timed out') || errorMsg.includes('timeout')) {
    timeoutErrorCount++;
    console.error(`   ⚠️  TIMEOUT ERROR #${timeoutErrorCount} detected!`);

    // Show timing context
    const timeSinceStart = Math.round((Date.now() - testStartTime) / 1000);
    const timeSinceLastJob = lastJobCompletionTime
      ? Math.round((Date.now() - lastJobCompletionTime) / 1000)
      : 0;

    console.error(`   ⏱️  Time since test start: ${timeSinceStart}s`);
    if (lastJobCompletionTime) {
      console.error(
        `   ⏱️  Time since last job completed: ${timeSinceLastJob}s`,
      );
    }
  }
});

testQueue.on('waiting', (jobId) => {
  console.log(`⏳ Job ${jobId} is waiting in queue`);
});

testQueue.on('active', (job) => {
  console.log(`🔄 Job ${job.id} is now active - processing started`);
});

testQueue.on('completed', (job, result) => {
  jobsCompleted++;
  lastJobCompletionTime = Date.now();
  jobsProcessed.push({
    id: job.id,
    data: job.data,
    result: result,
    completedAt: new Date().toISOString(),
  });

  console.log(`✅ Job ${job.id} completed successfully`);
  console.log(`   Result: ${JSON.stringify(result)}`);
  console.log(`   Jobs completed: ${jobsCompleted}/${JOB_COUNT}`);

  // Start monitoring period after all jobs complete
  if (jobsCompleted === JOB_COUNT) {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ All ${JOB_COUNT} jobs completed!`);
    console.log(`⏱️  Starting ${TEST_DURATION / 1000}s monitoring period...`);
    console.log('   Watching for timeout errors...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    startMonitoring();
  }
});

testQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed: ${err.message}`);
});

// Process jobs
testQueue.process(async (job) => {
  console.log(`   Processing job ${job.id}: ${JSON.stringify(job.data)}`);

  // Simulate work
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return {
    processed: true,
    jobId: job.id,
    timestamp: new Date().toISOString(),
  };
});

// Monitoring function
function startMonitoring() {
  const monitorStartTime = Date.now();
  const timeoutCountAtStart = timeoutErrorCount;

  monitoringInterval = setInterval(() => {
    const elapsed = Date.now() - monitorStartTime;
    const remaining = TEST_DURATION - elapsed;

    if (remaining > 0) {
      const seconds = Math.round(remaining / 1000);
      const newTimeouts = timeoutErrorCount - timeoutCountAtStart;

      process.stdout.write(
        `\r⏱️  Monitoring: ${seconds}s remaining | Timeout errors: ${newTimeouts}     `,
      );
    } else {
      process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Clear line
      finishTest(timeoutCountAtStart);
    }
  }, 1000);
}

// Finish test and report results
async function finishTest(timeoutCountAtStart) {
  clearInterval(monitoringInterval);

  const newTimeoutErrors = timeoutErrorCount - timeoutCountAtStart;
  const testDurationSeconds = Math.round((Date.now() - testStartTime) / 1000);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 TEST RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`⏱️  Total test duration: ${testDurationSeconds}s`);
  console.log(`✅ Jobs completed: ${jobsCompleted}/${JOB_COUNT}`);
  console.log(`❌ Timeout errors during monitoring: ${newTimeoutErrors}`);
  console.log(`❌ Total timeout errors: ${timeoutErrorCount}`);
  console.log('');

  // Detailed job results
  if (jobsProcessed.length > 0) {
    console.log('📦 Processed Jobs:');
    jobsProcessed.forEach((job, index) => {
      console.log(`   ${index + 1}. Job ${job.id} - ${job.completedAt}`);
    });
    console.log('');
  }

  // Final verdict
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (jobsCompleted === JOB_COUNT && newTimeoutErrors === 0) {
    console.log('✅ TEST PASSED!');
    console.log('');
    console.log('   ✓ All jobs processed successfully');
    console.log('   ✓ No timeout errors after job completion');
    console.log('   ✓ Worker continues waiting without errors');
    console.log('   ✓ Queue is healthy and ready for production');
  } else {
    console.log('❌ TEST FAILED!');
    console.log('');
    if (jobsCompleted !== JOB_COUNT) {
      console.log(`   ✗ Only ${jobsCompleted}/${JOB_COUNT} jobs completed`);
    }
    if (newTimeoutErrors > 0) {
      console.log(
        `   ✗ ${newTimeoutErrors} timeout errors during monitoring period`,
      );
      console.log('   ✗ Queue is entering a timeout loop');
      console.log('   ✗ NOT SAFE FOR PRODUCTION');
    }
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Cleanup
  await testQueue.close();

  // Exit with appropriate code
  process.exit(jobsCompleted === JOB_COUNT && newTimeoutErrors === 0 ? 0 : 1);
}

// Add test jobs
async function addTestJobs() {
  console.log(`📝 Adding ${JOB_COUNT} test jobs to queue...`);
  console.log('');

  for (let i = 1; i <= JOB_COUNT; i++) {
    const job = await testQueue.add({
      testNumber: i,
      message: `Test job ${i}`,
      timestamp: new Date().toISOString(),
    });
    console.log(`   Added job ${job.id}`);
  }

  console.log('');
  console.log('🚀 Jobs queued, waiting for processing...');
  console.log('');
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Test interrupted by user');
  clearInterval(monitoringInterval);
  await testQueue.close();
  process.exit(1);
});

// Run test
(async () => {
  try {
    console.log('🧪 Bull Queue Timeout Loop Detection Test');
    console.log('=========================================');
    console.log('');

    // Wait for queue to be ready
    await testQueue.isReady();
    console.log('✅ Queue connection established');
    console.log('');

    // Clean queue before test
    await testQueue.empty();
    await testQueue.clean(0, 'completed');
    await testQueue.clean(0, 'failed');

    // Add and process jobs
    await addTestJobs();
  } catch (error) {
    console.error('❌ Test setup failed:', error.message);
    console.error(error.stack);
    await testQueue.close();
    process.exit(1);
  }
})();
