# Debugging Bull Queue with Upstash Redis: A Production Email Nightmare

_Or: How I spent two days fighting `lazyConnect: true` and lived to tell the tale_

---

## The Setup

I'm working on JOOAV ERP, a backend system built with NestJS. We have an email notification system that uses:

- **Bull** for job queuing
- **Redis** (Upstash) for the queue backend
- **Resend** for actually sending emails
- **NestJS event emitters** to trigger emails on business events

The flow should be simple:

1. User does something (like reassign an order)
2. Event emitter fires
3. Email listener picks it up
4. Queues an email job in Bull
5. Bull worker processes the job
6. Email gets sent via Resend

Should be. Should.

---

## Day 1: "It Works Locally!"

Everything worked perfectly in development. Emails were flying out like clockwork. I'd trigger an order reassignment, and boom—three emails sent (to the new officer, old officer, and admins).

Then I deployed to production on Render.com.

Nothing.

Not a single email. No errors either. Just... silence.

---

## The First Debugging Session: Redis Timeouts

My logs in production showed this:

```
MaxRetriesPerRequestError: Reached the max retries per request limit (which is 20).
Refer to "maxRetriesPerRequest" option for details.
```

and

```
Command timed out
```

Okay, Redis is timing out. Classic production issue. I'd seen recommendations to use `maxRetriesPerRequest: null` for Bull queues, so I tried that first.

### Attempt 1: Set maxRetriesPerRequest to null

```typescript
BullModule.forRootAsync({
  useFactory: async (configService: ConfigService) => {
    return {
      redis: {
        // ... connection config ...
        maxRetriesPerRequest: null, // ← The fix everyone recommends
      },
    };
  },
});
```

Deployed. Still nothing. But at least the timeout errors stopped appearing.

---

## Attempt 2: The TLS Configuration Saga

I noticed I was using Upstash Redis, which requires TLS. My initial config had:

```typescript
tls: {
  rejectUnauthorized: false,
}
```

Maybe Upstash doesn't like that? I'd read that some Redis providers just want an empty TLS object. Changed it to:

```typescript
tls: {
}
```

Deployed. Still nothing. But hey, at least I wasn't getting TLS errors either.

---

## Attempt 3: The URL vs. Host/Port Debate

My production config was using the URL-based connection:

```typescript
redis: {
  url: process.env.REDIS_URL, // rediss://default:password@host:6379
  // ... other options ...
}
```

But I'd seen Bull documentation mention that parsing the URL yourself is more reliable:

```typescript
const parsedUrl = new URL(redisUrl);
return {
  redis: {
    host: parsedUrl.hostname,
    port: parseInt(parsedUrl.port) || 6379,
    username: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    tls: parsedUrl.protocol === 'rediss:' ? {} : undefined,
    // ...
  },
};
```

Deployed. **Still nothing.**

At this point, I was frustrated. Every "fix" I found online wasn't working.

---

## Day 2: The Case Sensitivity Detour

While investigating, I noticed a different issue: admin login wasn't working because email comparison was case-sensitive. Quick detour to fix that:

```typescript
// Before
const user = await this.prisma.user.findUnique({
  where: { email: email },
});

// After
const user = await this.prisma.user.findUnique({
  where: { email: email.toLowerCase() },
});
```

Not related to the email issue, but at least I was making _some_ progress.

---

## The Circuit Breaker Distraction

I thought maybe Redis was unstable, so I implemented a circuit breaker pattern. The idea: if Bull queue fails, fall back to sending emails directly.

```typescript
async queueEmail(request: QueueEmailRequest): Promise<void> {
  await this.circuitBreaker.executeWithFallback(
    async () => {
      // Try to queue
      await this.emailQueue.add('send-template-email', request);
    },
    async () => {
      // Fallback: send directly
      await this.sendTemplateEmail(request);
    }
  );
}
```

This felt productive. I was solving the problem by... working around it. But it still didn't address the core issue: **Why wasn't Bull processing jobs?**

---

## The Breakthrough: Enhanced Logging

I decided to add aggressive logging to see what was actually happening. First, in the email service:

```typescript
async queueEmail(request: QueueEmailRequest): Promise<void> {
  const job = await this.emailQueue.add('send-template-email', request);
  this.logger.log(`Email queued: job=${job.id} template=${request.templateAlias}`);
}
```

Then in the processor:

```typescript
@Process({ name: 'send-template-email', concurrency: 2 })
async handleSingleEmail(job: Job<QueueEmailRequest>) {
  this.logger.log(`Processing email job: ${job.id} - ${data.templateAlias}`);
  // ... actual processing ...
}
```

Deployed and triggered an email event.

Production logs showed:

```json
{
  "context": "EmailService",
  "message": "Batch email job queued: job=3 size=3 priority=high"
}
```

But **no processor log**. The job was being queued, but the processor wasn't picking it up.

This was huge. The problem wasn't Redis timing out. The problem was that **Bull workers weren't running at all**.

---

## Creating Diagnostic Scripts

I needed to isolate the problem. Was it Bull? Redis? My NestJS setup? Time for some standalone tests.

### Test 1: Can ioredis connect to Upstash?

```javascript
const Redis = require('ioredis');
const redis = new Redis({
  host: 'better-slug-20962.upstash.io',
  port: 6379,
  password: 'AVHiAAInc...',
  tls: {},
});

redis.ping().then(() => {
  console.log('✅ Connected');
  redis
    .lpush('test', 'value')
    .then(() => {
      return redis.blpop('test', 1); // Blocking pop
    })
    .then(() => {
      console.log('✅ BLPOP works');
      process.exit(0);
    });
});
```

Result: **✅ BLPOP works**

Okay, so Redis blocking operations work fine. Not a Redis issue.

### Test 2: Can Bull process jobs?

```javascript
const Queue = require('bull');

const queue = new Queue('test', {
  redis: {
    host: 'better-slug-20962.upstash.io',
    port: 6379,
    password: 'AVHiAAInc...',
    tls: {},
  },
});

queue.process(async (job) => {
  console.log(`✅ PROCESSOR INVOKED! Job ${job.id}`);
  return { success: true };
});

queue.add({ test: 'data' });

// Wait 5 seconds
setTimeout(async () => {
  const counts = await queue.getJobCounts();
  console.log('Waiting:', counts.waiting);
  console.log('Completed:', counts.completed);
  process.exit(0);
}, 5000);
```

Result:

```
✅ PROCESSOR INVOKED! Job 1
Waiting: 0
Completed: 1
```

**Wait, what?**

Bull works fine in a standalone script. But not in my NestJS app? That made no sense.

---

## The Configuration Deep Dive

I started comparing my test script to my production config. What was different?

My production config had these "optimizations" I'd added based on various blog posts and Stack Overflow answers:

```typescript
redis: {
  maxRetriesPerRequest: null,
  retryDelayOnFailover: 1000,
  enableReadyCheck: false,
  lazyConnect: true,           // ← Hmm...
  keepAlive: 30000,
  family: 4,
  connectTimeout: 60000,
  commandTimeout: 15000,
  tls: {},
}
```

My test script just had:

```typescript
redis: {
  host: '...',
  port: 6379,
  password: '...',
  tls: {},
}
```

Time to test each option systematically.

---

## Test 3: Isolating the Culprit

I created a new test that tried different configurations:

```javascript
const configs = [
  {
    name: 'With lazyConnect + maxRetriesPerRequest null',
    redis: {
      ...baseConfig,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    },
  },
  {
    name: 'WITHOUT lazyConnect',
    redis: {
      ...baseConfig,
      maxRetriesPerRequest: null,
      lazyConnect: false,
    },
  },
  {
    name: 'Standard config (no special options)',
    redis: baseConfig,
  },
];

for (const config of configs) {
  const queue = new Queue('test', config);
  await queue.isReady();

  queue.process(async (job) => {
    console.log(`✅ Processed with ${config.name}`);
    return { success: true };
  });

  await queue.add({ test: 'data' });

  // Wait 3 seconds
  await new Promise((r) => setTimeout(r, 3000));

  const counts = await queue.getJobCounts();
  console.log(`Completed: ${counts.completed}`);
}
```

Results:

```
Config 1 (lazyConnect: true):
  Completed: 0  ❌

Config 2 (lazyConnect: false):
  ✅ Processed with WITHOUT lazyConnect
  Completed: 1  ✅

Config 3 (standard):
  ✅ Processed with Standard config
  Completed: 1  ✅
```

**There it was.** `lazyConnect: true` was breaking Bull workers.

---

## Why lazyConnect Breaks Bull

Here's what I learned after digging into Bull's source code and ioredis documentation:

Bull uses Redis **blocking commands** to fetch jobs. Specifically, it uses `BRPOPLPUSH`:

```
BRPOPLPUSH source-queue destination-queue timeout
```

This command **blocks** the Redis connection until a job appears in the queue. It's how Bull achieves instant job processing without polling.

But here's the problem:

1. With `lazyConnect: true`, ioredis doesn't establish the TCP connection immediately
2. It waits until the first command is executed
3. Bull's worker immediately tries to run `BRPOPLPUSH`
4. But the connection isn't ready yet
5. The blocking command fails silently
6. The worker never receives jobs
7. Jobs pile up in the `waiting` state forever

With `lazyConnect: false`:

1. ioredis establishes the connection immediately when created
2. By the time Bull's worker tries `BRPOPLPUSH`, the connection is ready
3. The blocking command succeeds
4. Worker receives jobs instantly
5. Everything works ✅

---

## The Final Fix

One line change in `src/app.module.ts`:

```typescript
BullModule.forRootAsync({
  useFactory: async (configService: ConfigService) => {
    return {
      redis: {
        host: cloudRedis.host,
        port: cloudRedis.port,
        username: cloudRedis.username,
        password: cloudRedis.password,
        maxRetriesPerRequest: null,
        retryDelayOnFailover: 1000,
        enableReadyCheck: false,
        lazyConnect: false, // ← Changed from true to false
        keepAlive: 30000,
        family: 4,
        connectTimeout: 60000,
        commandTimeout: 15000,
        tls: cloudRedis.tls,
      },
    };
  },
});
```

I added diagnostic logging to confirm it was working:

```typescript
@Processor('email')
export class EmailProcessor implements OnModuleInit {
  constructor(private readonly emailService: EmailService) {
    this.logger.log('🚀 EmailProcessor instantiated - ready to process jobs');
  }

  onModuleInit() {
    this.logger.log('✅ EmailProcessor module initialized and ready');
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`🔄 Job ${job.id} is now active - processing started`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job, result: any) {
    this.logger.log(`✅ Job ${job.id} completed successfully`);
  }
}
```

Deployed to production. Triggered an order reassignment.

Logs:

```json
{"context":"EmailProcessor","message":"🚀 EmailProcessor instantiated - ready to process jobs"}
{"context":"EmailProcessor","message":"✅ EmailProcessor module initialized and ready"}
{"context":"EmailService","message":"Batch email job queued: job=4 size=3 priority=high"}
{"context":"EmailProcessor","message":"🔄 Job 4 is now active - processing started"}
{"context":"EmailProcessor","message":"Processing batch email job: 4 - 3 emails"}
{"context":"EmailService","message":"Email sent successfully: order-reassigned to officer@example.com"}
{"context":"EmailService","message":"Email sent successfully: order-reassigned to admin@example.com"}
{"context":"EmailService","message":"Email sent successfully: order-reassigned to oldofficer@example.com"}
{"context":"EmailProcessor","message":"✅ Job 4 completed successfully"}
```

**It worked.**

---

## Lessons Learned

### 1. Don't blindly apply "optimizations"

I added `lazyConnect: true` because I saw it in multiple Redis optimization guides. It's supposed to improve connection pooling and reduce connection overhead. But it's fundamentally incompatible with Bull's blocking worker pattern.

**Lesson:** Understand _why_ an optimization exists and whether it applies to your use case.

### 2. Reproduce in isolation

The breakthrough came when I created a standalone Bull test script. This removed all the NestJS complexity and let me focus purely on Bull + Redis. Within 30 minutes of creating that script, I'd identified the culprit.

**Lesson:** When something doesn't work in a complex system, strip it down to the basics.

### 3. Log everything during debugging

Those diagnostic logs were crucial. Without them, I would never have known that jobs were being queued but not processed. I would have kept chasing Redis connection issues.

**Lesson:** When debugging production, log state transitions aggressively. You can remove them later.

### 4. Read the source code

I spent hours reading blog posts about Bull configuration. Most were outdated or wrong. Finally, I cloned the Bull repo and read how it actually uses Redis. That's when I understood the blocking command requirement.

**Lesson:** Documentation and blog posts get out of date. Source code doesn't lie.

### 5. Test your assumptions

I _assumed_ my Redis connection was working because jobs were being queued. But queuing and processing use different connection patterns. Queueing uses simple `LPUSH`. Processing uses `BRPOPLPUSH` which requires a persistent blocking connection.

**Lesson:** Split your assumptions into testable pieces. Test each one.

---

## The Blockers I Hit (Timeline)

### Day 1, Hour 1-2: Initial Deployment

- **Issue:** No emails in production, timeouts in logs
- **Tried:** `maxRetriesPerRequest: null`
- **Result:** Timeouts stopped, but still no emails

### Day 1, Hour 3-4: TLS Configuration

- **Issue:** Still no emails
- **Tried:** Changed `tls: { rejectUnauthorized: false }` to `tls: {}`
- **Result:** No change

### Day 1, Hour 5-6: URL vs Host/Port

- **Issue:** Still no emails
- **Tried:** Parse REDIS_URL and use explicit host/port/password
- **Result:** No change

### Day 1, Hour 7-8: Circuit Breaker

- **Issue:** Still no emails
- **Tried:** Implement fallback to direct email sending
- **Result:** Fallback worked, but queue still broken

### Day 2, Hour 1-2: Enhanced Logging

- **Breakthrough:** Realized jobs are queued but not processed
- **Tried:** Add detailed logs to processor
- **Result:** Confirmed processor isn't picking up jobs

### Day 2, Hour 3-4: Standalone Tests

- **Breakthrough:** Bull works in standalone script
- **Tried:** Test Redis BLPOP, test Bull in isolation
- **Result:** Everything works outside NestJS

### Day 2, Hour 5-6: Configuration Comparison

- **Breakthrough:** Found difference in lazyConnect
- **Tried:** Systematic test of each config option
- **Result:** Identified lazyConnect: true as the culprit

### Day 2, Hour 7: The Fix

- **Fix:** Changed lazyConnect to false
- **Tried:** Deploy to production
- **Result:** ✅ **EMAILS WORKING!**

---

## Tools That Helped

1. **Redis CLI** - For manually inspecting queue state
2. **Upstash Console** - For seeing connection metrics
3. **Node REPL** - For quick ioredis tests
4. **Standalone scripts** - For isolating Bull behavior
5. **Git bisect** - For finding when it broke (turns out it never worked in prod)

---

## Final Thoughts

Two days. Over 16 hours of debugging. All for one configuration flag.

But here's the thing: I learned more about Bull, Redis, and distributed job queues in those two days than I had in months of using them. I now understand:

- How Bull uses blocking Redis commands
- Why connection timing matters for blocking operations
- The difference between queue producers and consumers
- How to debug production issues systematically
- Why you can't trust every "optimization" you read online

Was it frustrating? Absolutely. Would I rather have spent those two days building features? Sure. But now I have a rock-solid email system and the knowledge to debug similar issues in seconds.

And that's worth something.

---

## Appendix: Final Working Configuration

For anyone Googling "Bull queue not processing jobs Upstash Redis":

```typescript
// app.module.ts
BullModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => {
    const redisUrl = configService.get<string>('REDIS_URL');
    const parsed = new URL(redisUrl);

    return {
      redis: {
        host: parsed.hostname,
        port: parseInt(parsed.port) || 6379,
        password: decodeURIComponent(parsed.password),
        tls: parsed.protocol === 'rediss:' ? {} : undefined,

        // Critical options for Bull workers:
        maxRetriesPerRequest: null,      // Required for Bull
        enableReadyCheck: false,         // Faster startup
        lazyConnect: false,               // CRITICAL: Must be false for workers!

        // Performance tuning:
        retryDelayOnFailover: 1000,
        keepAlive: 30000,
        connectTimeout: 60000,
        commandTimeout: 15000,
      },
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
    };
  },
  inject: [ConfigService],
}),
```

Key points:

- ✅ Parse URL manually (more reliable)
- ✅ Use `maxRetriesPerRequest: null` for Bull
- ✅ Set `lazyConnect: false` for workers
- ✅ Use `tls: {}` for TLS connections
- ✅ Add generous timeouts for cloud Redis

Good luck, and may your queues always process.

---

_Written while the pain is still fresh, so hopefully you can avoid it._
