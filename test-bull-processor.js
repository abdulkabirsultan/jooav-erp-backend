/**
 * Deep Bull Processor Investigation
 * Testing different connection strategies
 */

const Queue = require('bull');
require('dotenv').config();

async function testProcessorConnection() {
  console.log('🔍 Bull Processor Connection Test\n');

  const redisUrl = process.env.REDIS_URL;
  const parsed = new URL(redisUrl);

  const baseConfig = {
    host: parsed.hostname,
    port: parseInt(parsed.port) || 6379,
    password: decodeURIComponent(parsed.password),
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };

  // Test different configurations
  const configs = [
    {
      name: 'With lazyConnect + maxRetriesPerRequest null',
      redis: {
        ...baseConfig,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: true,
      },
    },
    {
      name: 'WITHOUT lazyConnect',
      redis: {
        ...baseConfig,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: false, // Key difference
      },
    },
    {
      name: 'Standard config (no special options)',
      redis: baseConfig,
    },
  ];

  for (const config of configs) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 Testing: ${config.name}`);
    console.log('='.repeat(60));

    const queue = new Queue('test-processor', config);

    try {
      console.log('⏳ Waiting for ready...');
      await queue.isReady();
      console.log('✅ Queue ready');

      // Clean
      await queue.empty();
      await queue.clean(0);

      let processed = false;
      let processorCalled = false;

      // Register processor
      console.log('🔧 Registering processor...');
      queue.process(async (job) => {
        processorCalled = true;
        console.log(`  ✅ PROCESSOR CALLED for job ${job.id}`);
        processed = true;
        return { success: true };
      });
      console.log('✅ Processor registered');

      // Add job
      console.log('➕ Adding job...');
      const job = await queue.add({ test: 'data' });
      console.log(`✅ Job ${job.id} added`);

      // Wait
      console.log('⏳ Waiting 3 seconds...');
      await new Promise((r) => setTimeout(r, 3000));

      // Check
      const counts = await queue.getJobCounts();
      console.log('\n📊 Results:');
      console.log(
        `   Processor Called: ${processorCalled ? '✅ YES' : '❌ NO'}`,
      );
      console.log(`   Waiting: ${counts.waiting}`);
      console.log(`   Completed: ${counts.completed}`);

      if (processorCalled) {
        console.log('\n🎉 THIS CONFIG WORKS!\n');
      } else {
        console.log('\n❌ THIS CONFIG FAILED\n');
      }

      await queue.close();
    } catch (error) {
      console.log(`\n❌ Error: ${error.message}\n`);
      try {
        await queue.close();
      } catch {}
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🏁 Testing complete');
  process.exit(0);
}

testProcessorConnection().catch(console.error);
