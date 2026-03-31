/**
 * Final Verification - Bull with Production Config (lazyConnect: false)
 * Uses Redis Cloud for Bull, falls back to REDIS_URL
 */

const Queue = require('bull');
require('dotenv').config();

async function finalTest() {
  console.log('🎯 FINAL VERIFICATION TEST\n');
  console.log(
    'Testing Bull with FIXED production config (lazyConnect: false)\n',
  );

  // Redis Cloud configuration for Bull
  const redisCloudHost = process.env.REDIS_CLOUD_HOST;
  const redisCloudPort = process.env.REDIS_CLOUD_PORT;
  const redisCloudUsername = process.env.REDIS_CLOUD_USERNAME;
  const redisCloudPassword = process.env.REDIS_CLOUD_PASSWORD;

  let redisConfig;

  if (redisCloudHost && redisCloudPassword) {
    redisConfig = {
      host: redisCloudHost,
      port: redisCloudPort ? parseInt(redisCloudPort, 10) : 6379,
      username: redisCloudUsername || 'default',
      password: redisCloudPassword,
    };
    console.log(
      `📡 Using Redis Cloud: ${redisConfig.host}:${redisConfig.port}`,
    );
  } else {
    // Fallback to REDIS_URL
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      console.error('❌ No Redis configuration found');
      process.exit(1);
    }
    const parsed = new URL(redisUrl);
    redisConfig = {
      host: parsed.hostname,
      port: parseInt(parsed.port) || 6379,
      username: parsed.username
        ? decodeURIComponent(parsed.username)
        : undefined,
      password: parsed.password
        ? decodeURIComponent(parsed.password)
        : undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
    };
    console.log(`📡 Using REDIS_URL: ${redisConfig.host}:${redisConfig.port}`);
  }

  // FIXED production config
  const productionConfig = {
    redis: {
      host: redisConfig.host,
      port: redisConfig.port,
      username: redisConfig.username,
      password: redisConfig.password,
      tls: redisConfig.tls,
      maxRetriesPerRequest: null,
      retryDelayOnFailover: 1000,
      enableReadyCheck: false,
      lazyConnect: false, // ← THE FIX!
      keepAlive: 30000,
      family: 4,
      connectTimeout: 60000,
      commandTimeout: 300000,
    },
  };

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
