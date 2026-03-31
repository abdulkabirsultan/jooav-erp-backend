# Bull Queue Email Diagnostic Guide

## Current Situation

You're seeing this in production logs:

```json
{"timestamp":"2026-03-31T07:02:54.050Z","level":"info","context":"EmailService","message":"Batch email job queued: job=3 size=3 priority=high"}
{"timestamp":"2026-03-31T07:02:54.051Z","level":"info","context":"EmailService","message":"Batch emails queued: 3 emails in 1 chunks"}
```

**Problem**: Jobs are being **queued** but **NOT processed** (no `Processing email job...` logs).

## Root Cause Analysis

The issue is that **Bull workers (EmailProcessor) are NOT picking up jobs from the queue**.

This can happen due to:

1. ❌ Redis connection mismatch between producer (EmailService) and consumer (EmailProcessor)
2. ❌ EmailProcessor not being instantiated properly
3. ❌ Bull module configuration issues
4. ❌ Redis connection dying after queue initialization

## Diagnostic Steps

### Step 1: Run the Bull Queue Test Script

This will test if Bull can communicate with your Upstash Redis:

```bash
npm run test:bull-queue
```

**What this tests:**

- ✅ Redis connection setup
- ✅ Bull queue creation
- ✅ Job enqueueing
- ✅ Job processing with worker
- ✅ Queue event handling
- ✅ Stalled job detection

**Expected Output:**

```
🎉 SUCCESS! Bull queue is working with your Redis connection!
✅ Jobs processed: 2
```

**If you see this instead:**

```
⚠️  ISSUE: Jobs are queuing but not being processed!
```

Then the problem is in your application, not Redis.

---

### Step 2: Check Application Startup Logs

After deploying the updated code, check your production logs for these **critical startup messages**:

```
🚀 EmailProcessor instantiated - ready to process jobs
✅ EmailProcessor module initialized
```

**If you DON'T see these logs:**

- EmailProcessor is not being loaded
- EmailModule might not be imported properly
- NestJS dependency injection issue

**If you DO see these logs but still no processing:**

- Bull queue event system not working
- Redis connection different between modules
- Queue name mismatch

---

### Step 3: Trigger an Email and Watch for New Logs

With the updated code, you should now see:

```json
// When job is queued:
{"context":"EmailService","message":"Batch email job queued: job=3 size=3 priority=high"}

// When worker picks up job (NEW - this is missing now):
{"context":"EmailProcessor","message":"🔄 Job 3 (send-batch-emails) is now active"}
{"context":"EmailProcessor","message":"Processing batch email job: 3 - 3 emails"}

// When processing completes (NEW):
{"context":"EmailProcessor","message":"✅ Job 3 (send-batch-emails) completed successfully"}
{"context":"EmailService","message":"Email sent successfully: order-reassigned to ..."}
```

---

## What I Changed

### 1. Enhanced EmailProcessor Logging (`src/modules/email/processors/email.processor.ts`)

**Added:**

- Constructor log: Shows when processor is instantiated
- Module init log: Confirms processor is ready
- Queue event decorators:
  - `@OnQueueActive()` - Logs when job starts processing
  - `@OnQueueCompleted()` - Logs successful completion
  - `@OnQueueFailed()` - Logs failures with error details

**Why:** These logs will definitively show if the processor is:

1. Being created at startup
2. Seeing jobs in the queue
3. Processing them

### 2. Created Standalone Bull Test Script (`test-bull-queue.js`)

**Features:**

- Tests Bull with your exact Redis configuration
- Creates a test queue
- Adds test jobs
- Sets up a processor
- Monitors queue events
- Reports success/failure with diagnosis

**Why:** Isolates Bull+Redis testing from your application complexity.

### 3. Updated Redis Configuration (`src/app.module.ts`)

**Added support for:**

- Direct `REDIS_URL` (redis:// or rediss://)
- Fallback to `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

**Why:** Your `.env.production` might have the REST URL, this handles both cases.

---

## Likely Causes (Ordered by Probability)

### 1. **EmailProcessor Not Being Instantiated** (Most Likely)

**Symptoms:**

- No `🚀 EmailProcessor instantiated` log at startup
- Jobs queued but never processed

**Cause:**

- EmailModule not imported in AppModule
- Circular dependency preventing instantiation
- Provider not registered correctly

**Solution:**
Verify in `src/app.module.ts` that EmailModule is imported:

```typescript
imports: [
  // ... other imports
  EmailModule, // ← Must be present
];
```

### 2. **Multiple Redis Connections** (Second Most Likely)

**Symptoms:**

- Processor instantiates
- Jobs queued
- No processing happens

**Cause:**

- Producer (EmailService) connects to Redis instance A
- Consumer (EmailProcessor) connects to Redis instance B
- They're talking to different queues

**Solution:**
Both must use the exact same Redis configuration. The global `BullModule.forRootAsync()` configuration should be used by all queues.

### 3. **NODE_ENV Mismatch**

**Symptoms:**

- Works locally
- Doesn't work in production

**Cause:**
Your `.env` has `NODE_ENV=development`, but production might use different config path.

**Verify:**

```bash
# In production logs, look for:
"NODE_ENV": "production"  # or "development"
```

Make sure `REDIS_URL` is set correctly for your actual `NODE_ENV`.

### 4. **Redis Connection Dying After Startup**

**Symptoms:**

- First few jobs process
- Then stops processing
- No error logs

**Cause:**

- Connection timeout
- Upstash rate limiting
- Memory issues

**Solution:**
Already implemented with `maxRetriesPerRequest: null` and extended timeouts.

---

## Action Plan

### Immediate (Do This Now):

1. **Run the Bull test script:**

   ```bash
   npm run test:bull-queue
   ```

   This confirms Bull can work with your Redis.

2. **Deploy the updated code** with enhanced logging.

3. **Check startup logs** for:

   ```
   🚀 EmailProcessor instantiated
   ✅ EmailProcessor module initialized
   ```

4. **Trigger an email event** (like order reassignment).

5. **Check for processor logs**:
   - If you see `🔄 Job X is now active` → Workers are working!
   - If you don't see it → Workers aren't picking up jobs.

### If Workers Still Don't Process:

1. **Check your production `.env` file** (or environment variables on Render):

   ```bash
   # Must have ONE of these set correctly:
   REDIS_URL="rediss://default:PASSWORD@HOST:6379"
   # OR
   UPSTASH_REDIS_REST_URL="https://HOST.upstash.io"
   UPSTASH_REDIS_REST_TOKEN="YOUR_TOKEN"
   ```

2. **Verify EmailModule is imported** in `app.module.ts`.

3. **Check for Bull queue conflicts**:

   ```bash
   # In production, search logs for:
   grep "Queue 'email'" logs.txt
   ```

   Should appear exactly once during startup.

4. **Enable Bull board** for visual debugging (optional):
   Install `@bull-board/express` and mount UI to see queue status in browser.

---

## Testing Commands

```bash
# Test Bull queue with your Redis
npm run test:bull-queue

# Test raw Redis connection
npm run test:redis-prod

# Build and start in development
npm run build
npm run start:dev

# Check logs for processor initialization
npm run start:dev 2>&1 | grep "EmailProcessor"
```

---

## Expected Successful Flow

```mermaid
sequenceDiagram
    participant API as API Endpoint
    participant Event as EventEmitter
    participant Listener as EmailListener
    participant Service as NotificationService
    participant EmailSvc as EmailService
    participant Queue as Bull Queue
    participant Redis as Upstash Redis
    participant Processor as EmailProcessor
    participant Resend as Resend API

    API->>Event: Emit ORDER_REASSIGNED
    Event->>Listener: @OnEvent handler
    Listener->>Service: notifyOrderReassigned()
    Service->>EmailSvc: queueBatchEmails()
    EmailSvc->>Queue: add('send-batch-emails', data)
    Queue->>Redis: LPUSH bull:email:wait [job]
    Note over Queue,Redis: Job is now in Redis queue

    Processor->>Redis: BRPOPLPUSH bull:email:wait
    Redis-->>Processor: Return job data
    Note over Processor: 🔄 Job is now active
    Processor->>EmailSvc: sendBatchEmails()
    EmailSvc->>Resend: POST /emails/batch
    Resend-->>EmailSvc: 200 OK {ids: [...]}
    EmailSvc-->>Processor: {success: true}
    Processor->>Redis: LREM bull:email:active [job]
    Note over Processor: ✅ Job completed
```

**The break is happening at:** `Processor->>Redis: BRPOPLPUSH`
The processor is not pulling jobs from the Redis queue.

---

## Quick Reference

| Log Message                      | Meaning                            | Action    |
| -------------------------------- | ---------------------------------- | --------- |
| `Batch email job queued: job=3`  | ✅ Job successfully added to queue | Good!     |
| `🚀 EmailProcessor instantiated` | ✅ Processor is loaded             | Good!     |
| `🔄 Job 3 is now active`         | ✅ Processor picked up job         | Perfect!  |
| `Processing batch email job: 3`  | ✅ Job is being processed          | Perfect!  |
| `Email sent successfully`        | ✅ Email was sent via Resend       | Success!  |
| No processor logs                | ❌ Processor not picking up jobs   | **ISSUE** |

---

## Need More Help?

If after running the test script and checking logs you're still stuck, provide:

1. Output of `npm run test:bull-queue`
2. First 50 lines of production startup logs
3. Environment variables (with passwords redacted):
   ```bash
   env | grep -E "NODE_ENV|REDIS|EMAIL" | sed 's/=.*/=[REDACTED]/'
   ```

I'll help identify the exact issue.
