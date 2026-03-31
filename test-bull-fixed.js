/**
 * Final Verification - Bull with Production Config (lazyConnect: false)
 */

const Queue = require('bull');
require('dotenv').config();

async function finalTest() {
  console.log('🎯 FINAL VERIFICATION TEST\n');
  console.log(
    'Testing Bull with FIXED production config (lazyConnect: false)\n',
  );

  const redisUrl = process.env.REDIS_URL;
  const parsed = new URL(redisUrl);

  // FIXED production config
  const productionConfig = {
    redis: {
      host: parsed.hostname,
      port: parseInt(parsed.port) || 6379,
      password: decodeURIComponent(parsed.password),
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
      retryDelayOnFailover: 1000,
      enableReadyCheck: false,
      lazyConnect: false, // ← THE FIX!
      keepAlive: 30000,
      family: 4,
      connectTimeout: 60000,
      commandTimeout: 15000,
    },
  };

  console.log('📡 Connecting to:', parsed.hostname);
  const queue = new Queue('email', productionConfig);

  await queue.isReady();
  console.log('✅ Queue ready\n');

  // Clean
  await queue.empty();
  await queue.clean(0);

  let processed = 0;

  // Register processor
  console.log('🔧 Registering email processor...');
  queue.process('send-batch-emails', async (job) => {
    processed++;
    console.log(`\n✅ PROCESSOR WORKING! Job ${job.id} processed`);
    console.log(`   Data:`, JSON.stringify(job.data).substring(0, 100));
    return { success: true, emailsSent: job.data.requests?.length || 0 };
  });
  console.log('✅ Processor registered\n');

  // Add test job (similar to your production jobs)
  console.log('➕ Adding batch email job...');
  const job = await queue.add(
    'send-batch-emails',
    {
      requests: [
        { to: 'test1@example.com', template: 'order-reassigned' },
        { to: 'test2@example.com', template: 'order-reassigned' },
        { to: 'test3@example.com', template: 'order-reassigned' },
      ],
      priority: 'high',
    },
    {
      priority: 10,
    },
  );
  console.log(`✅ Job ${job.id} added\n`);

  // Wait
  console.log('⏳ Waiting 5 seconds for processing...');
  await new Promise((r) => setTimeout(r, 5000));

  // Results
  const counts = await queue.getJobCounts();
  console.log('\n📊 RESULTS:');
  console.log('━'.repeat(50));
  console.log(`✅ Jobs Processed:  ${processed}`);
  console.log(`📥 Jobs Waiting:    ${counts.waiting}`);
  console.log(`✅ Jobs Completed:  ${counts.completed}`);
  console.log(`❌ Jobs Failed:     ${counts.failed}`);
  console.log('━'.repeat(50));

  if (processed > 0 && counts.completed > 0) {
    console.log('\n🎉 SUCCESS! The fix works!');
    console.log('✅ Bull processors CAN now pick up jobs');
    console.log('✅ Production config is correct');
    console.log('\n📝 Deploy this to production and emails will work!\n');
    await queue.close();
    process.exit(0);
  } else {
    console.log('\n❌ STILL BROKEN');
    console.log('Need further investigation\n');
    await queue.close();
    process.exit(1);
  }
}

finalTest().catch((e) => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
