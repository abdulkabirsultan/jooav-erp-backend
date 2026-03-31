// Production Environment Validation
console.log('🔍 Environment Validation:');
console.log('═'.repeat(30));

const required = {
  'NODE_ENV': process.env.NODE_ENV,
  'REDIS_URL': process.env.REDIS_URL ? '[SET]' : '[MISSING]',
  'UPSTASH_REDIS_REST_URL': process.env.UPSTASH_REDIS_REST_URL ? '[SET]' : '[MISSING]',
  'UPSTASH_REDIS_REST_TOKEN': process.env.UPSTASH_REDIS_REST_TOKEN ? '[SET]' : '[MISSING]'
};

console.table(required);

// Validate Redis URL format
if (process.env.REDIS_URL) {
  try {
    const url = new URL(process.env.REDIS_URL);
    console.log(`✅ REDIS_URL format valid: ${url.protocol}//${url.hostname}:${url.port}`);
  } catch (e) {
    console.log(`❌ REDIS_URL format invalid: ${e.message}`);
  }
}

// Check for Redis connectivity preference
const hasUpstash = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;
const hasRedisUrl = process.env.REDIS_URL;

if (process.env.NODE_ENV === 'production') {
  if (!hasUpstash && !hasRedisUrl) {
    console.log('❌ CRITICAL: No Redis configuration found for production!');
  } else if (hasUpstash) {
    console.log('✅ Using Upstash Redis configuration');
  } else if (hasRedisUrl) {
    console.log('✅ Using REDIS_URL configuration');
  }
} else {
  console.log('ℹ️  Development environment detected');
}
