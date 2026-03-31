/**
 * Simple Bull Test - Minimal reproduction
 */

const Queue = require('bull');
require('dotenv').config();

async function simpleTest() {
  console.log('🔍 Simple Bull Queue Test\n');

  // Parse Redis URL
  const redisUrl = process.env.REDIS_URL;
  const parsed = new URL(redisUrl);

  const redisConfig = {
    host: parsed.hostname,
    port: parseInt(parsed.port) || 6379,
    password: decodeURIComponent(parsed.password),
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };

  console.log('📡 Redis:', redisConfig.host);

  // Create queue
  const queue = new Queue('test', { redis: redisConfig });

  console.log('⏳ Waiting for queue ready...');
  await queue.isReady();
  console.log('✅ Queue ready\n');

  // Clean up
  await queue.empty();
  await queue.clean(0);

  let processed = false;

  // Register processor FIRST
  console.log('🔧 Registering processor...');
  queue.process(async (job) => {
    console.log(`✅ PROCESSOR INVOKED! Job ${job.id}`);
    processed = true;
    return { success: true };
  });
  console.log('✅ Processor registered\n');

  // Add job
  console.log('➕ Adding job...');
  const job = await queue.add({ test: 'data' });
  console.log(`✅ Job ${job.id} added\n`);

  // Wait
  console.log('⏳ Waiting 5 seconds for processing...');
  await new Promise((r) => setTimeout(r, 5000));

  // Check
  const counts = await queue.getJobCounts();
  console.log('\n📊 Final Status:');
  console.log(`   Waiting: ${counts.waiting}`);
  console.log(`   Active: ${counts.active}`);
  console.log(`   Completed: ${counts.completed}`);
  console.log(`   Processed: ${processed ? '✅ YES' : '❌ NO'}\n`);

  if (processed) {
    console.log('🎉 SUCCESS! Bull workers can process jobs.\n');
  } else {
    console.log('❌ FAILED! Jobs added but not processed.');
    console.log('   This confirms the issue is with Bull workers.\n');
  }

  await queue.close();
  process.exit(processed ? 0 : 1);
}

simpleTest().catch(console.error);
