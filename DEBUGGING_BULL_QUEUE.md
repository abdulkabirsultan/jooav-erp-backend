# Debugging Bull Queue with Upstash Redis: A Production Email Nightmare

Or how I spent two days fighting `lazyConnect: true` only to discover another monster lurking in `commandTimeout`.

## The Setup

I'm working on JOOAV ERP, a backend system built with NestJS. We have an email notification system that uses Bull for job queuing, Redis (specifically Upstash) for the queue backend, Resend for actually sending emails, and NestJS event emitters to trigger emails on business events.

The flow should be simple. A user does something like reassigning an order. An event emitter fires. The email listener picks it up and queues an email job in Bull. The Bull worker processes the job, and the email gets sent via Resend.

Should be. Should.

## Day 1: "It Works Locally!"

Everything worked perfectly in development. Emails were flying out like clockwork. I'd trigger an order reassignment, and boom—three emails sent to the new officer, old officer, and admins.

Then I deployed to production on Render.com.

Nothing.

Not a single email. No errors either. Just silence. The kind of silence that makes you question everything you know about programming.

## The First Debugging Session: Redis Timeouts

My logs in production showed something was clearly wrong. I kept seeing `MaxRetriesPerRequestError: Reached the max retries per request limit (which is 20)` and `Command timed out` errors scattered throughout.

Okay, Redis is timing out. Classic production issue. I'd seen recommendations to use `maxRetriesPerRequest: null` for Bull queues because Bull handles its own retry logic, so I tried that first.

I updated my Bull configuration to set `maxRetriesPerRequest: null` and deployed. The timeout errors stopped appearing. Progress, right? Except still no emails. The silence continued.

## Attempt 2: The TLS Configuration Saga

I noticed I was using Upstash Redis, which requires TLS connections. My initial config had `tls: { rejectUnauthorized: false }` because I'd copied it from some Stack Overflow answer about Redis SSL issues.

Maybe Upstash doesn't like that? I'd read somewhere that some Redis providers just want an empty TLS object to indicate "yes, use TLS, but use the defaults." Changed it to just `tls: {}` and deployed.

Still nothing. But hey, at least I wasn't getting TLS-related errors either. The app was running, Redis was connected, jobs were being queued according to my logs. But where were they going?

## Attempt 3: The URL vs. Host/Port Debate

My production config was using the URL-based connection string like `redis: { url: process.env.REDIS_URL }` where the URL looked like `rediss://default:password@host:6379`.

But I'd seen Bull documentation mention that parsing the URL yourself is more reliable because ioredis sometimes has issues with URL-based connections. So I wrote a parser that extracted the hostname, port, username, and password, then passed them as explicit configuration options.

Deployed. Still nothing. At this point, I was frustrated. Every "fix" I found online wasn't working. I was following best practices, doing what the docs said, but nothing changed.

## Day 2: The Case Sensitivity Detour

While investigating the email system, I noticed a completely different issue. Admin login wasn't working because email comparison was case-sensitive. Someone had registered as `Admin@Example.com` and was trying to log in with `admin@example.com` and it was failing.

Quick detour to fix that. Changed the user lookup to use `email.toLowerCase()` for comparison. Not related to the email queue issue, but at least I was making some progress on something.

## The Circuit Breaker Distraction

At this point, I thought maybe Redis was just unstable. Maybe the connection was flaky, or Upstash was having issues. So I implemented a circuit breaker pattern. The idea was simple: if the Bull queue fails, fall back to sending emails directly without queuing.

This felt productive. I was solving the problem by working around it. The circuit breaker would try to queue the email, and if that failed, it would just send it immediately. I deployed this and tested it. The fallback worked perfectly. Emails were going out.

But it still didn't address the core issue. Why wasn't Bull processing jobs? The fallback was a band-aid, and I knew it. Plus, we were losing the benefits of queuing—no retries, no rate limiting, no distributed processing. This wasn't the solution I wanted.

## The Breakthrough: Enhanced Logging

I decided to add aggressive logging to see what was actually happening. I added logs when jobs were queued, showing the job ID and template name. Then I added logs in the processor to show when jobs started processing, when they completed, and when they failed.

I deployed and triggered an email event. My production logs showed the job being queued successfully. `Batch email job queued: job=3 size=3 priority=high`. Great! But then nothing. No processor log. The job was being queued, but the processor wasn't picking it up.

This was huge. The problem wasn't Redis timing out or TLS configuration or URL parsing. The problem was that Bull workers weren't running at all. Jobs were sitting in the queue, waiting to be processed, but the processor never woke up.

## Creating Diagnostic Scripts

I needed to isolate the problem. Was it Bull? Was it Redis? Was it my NestJS setup? Was Upstash not compatible with Bull's blocking commands? Time for some standalone tests outside of the application.

### Test 1: Can ioredis connect to Upstash?

I wrote a simple script using ioredis directly. It connected to Upstash, did a PING, pushed a value to a list, and then did a blocking pop (BLPOP) to retrieve it. I wanted to test whether Upstash supports blocking operations since Bull relies on them.

The script ran successfully. Connection worked. PING returned PONG. BLPOP retrieved the value. Okay, so Redis blocking operations work fine with Upstash. Not a Redis compatibility issue.

### Test 2: Can Bull process jobs?

Next, I wrote a standalone Bull script. Created a simple queue, registered a processor that just logged when it was invoked, added a job, and waited 5 seconds to see what happened.

The processor was invoked. The job completed. The queue showed 0 waiting jobs and 1 completed job. Bull works fine in a standalone script. But not in my NestJS app? That made no sense.

This was the most confusing moment of the entire debugging process. The technology stack worked perfectly in isolation but failed completely in the actual application. What was different?

## The Configuration Deep Dive

I started comparing my test script to my production config line by line. My test script had a minimal configuration—just host, port, password, and TLS. My production config had a bunch of "optimizations" I'd added based on various blog posts and Stack Overflow answers over the past few months.

Things like `enableReadyCheck: false`, `retryDelayOnFailover: 1000`, `keepAlive: 30000`, `family: 4`, `connectTimeout: 60000`, `commandTimeout: 15000`. And there, buried in the middle: `lazyConnect: true`.

I'd added that because multiple Redis optimization guides mentioned it improves connection pooling and reduces overhead by only establishing the TCP connection when the first command is executed. Seemed smart at the time.

My test script didn't have any of these. Just the basics. Time to test each option systematically.

## Test 3: Isolating the Culprit

I created a new test script that tried different configurations. With `lazyConnect: true`, without it, with `maxRetriesPerRequest: null`, without it. Every combination. Each configuration got its own queue, processor, and test job. The script ran them sequentially and reported which ones successfully processed jobs.

The results were clear. With `lazyConnect: true`, jobs never got processed. With `lazyConnect: false`, jobs processed immediately. With no lazyConnect specified (defaulting to false), jobs processed immediately.

There it was. `lazyConnect: true` was breaking Bull workers. After two days of debugging, the culprit was a single configuration flag I'd added months ago and forgotten about.

## Why lazyConnect Breaks Bull

After finding the issue, I wanted to understand why it happened. I dug into Bull's source code and ioredis documentation to piece together the full picture.

Bull uses Redis blocking commands to fetch jobs efficiently. Specifically, it uses `BRPOPLPUSH`, which atomically removes a job from one list and pushes it to another while blocking the connection until a job is available. This is how Bull achieves instant job processing without constantly polling Redis.

Here's what happens with `lazyConnect: true`. When ioredis is configured with lazy connections, it doesn't establish the TCP connection immediately when the client is created. Instead, it waits until the first command is executed. Bull's worker immediately tries to run `BRPOPLPUSH` to wait for jobs. But the connection isn't ready yet. The blocking command fails silently because there's no connection to block on. The worker never receives jobs. Jobs pile up in the waiting state forever.

With `lazyConnect: false`, the connection is established immediately when ioredis is created. By the time Bull's worker tries `BRPOPLPUSH`, the connection is ready, the blocking command succeeds, and the worker receives jobs instantly.

The cruel irony is that `lazyConnect: true` is a genuine optimization for many use cases. If you're doing request-response patterns where connections are short-lived, lazy connection can save resources. But for Bull workers that need persistent blocking connections, it's fatal.

## The Fix (Or So I Thought)

I changed `lazyConnect: true` to `lazyConnect: false` in my app.module.ts configuration. One line. Two years of TypeScript experience, dozens of hours reading documentation, and the fix was changing one boolean.

I added detailed diagnostic logging to confirm it was working. Constructor logs to show when the processor was instantiated. Lifecycle hook logs to show when it was initialized. Event decorator logs to show when jobs became active, completed, or failed.

I deployed to production. Triggered an order reassignment event. Watched the logs.

The processor instantiated. The processor initialized. The job was queued. The job became active. Three emails were sent. The job completed successfully.

It worked. After two days, emails were finally flowing in production. I celebrated. I documented the fix. I wrote a long commit message explaining what happened so future me would understand.

I went to bed feeling accomplished.

## Day 3: The Timeout Loop From Hell

The next morning, I checked the production logs to make sure everything was still stable.

My terminal filled with errors. `Command timed out. Command timed out. Command timed out.` Every 25-30 seconds. Forever. An infinite loop of timeout errors.

But here's the weird part. The emails still worked. Jobs were processed successfully. The logs showed jobs completing. But immediately after completion, the timeout errors started. Over and over. Hundreds of them.

I felt my stomach drop. The fix hadn't really fixed anything. I'd just traded one problem for another. Silent failures for noisy failures. At least the emails were working, but this wasn't production-ready. An infinite error loop would eventually cause issues, plus it was polluting the logs so badly that real errors would be impossible to spot.

## Understanding the Timeout Loop

I needed to understand what was happening. The job completed successfully at 07:55:07. The first timeout error appeared at 07:55:23—about 16 seconds later. Then another at 07:55:28. Then 07:55:53. The pattern was roughly 25-30 seconds between errors, but sometimes they came in pairs.

What was Bull doing after a job completed? It goes back to waiting for the next job. It runs `BRPOPLPUSH` again, which blocks for up to 5 seconds waiting for a job to appear in the queue. If no job appears, it returns null and tries again. This cycle continues forever—Bull workers need to stay active waiting for jobs.

But if `BRPOPLPUSH` blocks for 5 seconds, why was I seeing timeout errors? I looked at my Redis configuration again. `commandTimeout: 15000`. I'd set the command timeout to 15 seconds.

Wait. Bull blocks for 5 seconds per operation. Add network latency to Upstash (could be 100-500ms). Add some variance. If the command timeout is 15 seconds and Bull is trying to block for 5 seconds repeatedly, occasionally a command might exceed 15 seconds, especially if ioredis is retrying internally or if there's network congestion.

The timeout wasn't wrong. It was just too tight. Every time a command took slightly longer than expected, ioredis would timeout the operation, Bull would see an error, it would retry, and the cycle would continue.

## Testing the Timeout Theory

Before changing the configuration again, I wanted proof. I created a comprehensive test script called `test-bull-timeout-loop.js` that would simulate production conditions and monitor for timeout errors.

The test added three jobs to a queue, processed them all successfully, and then monitored for 60 seconds, watching for any "Command timed out" errors. It tracked how many timeouts occurred, when they occurred relative to job completion, and reported a clear pass/fail verdict at the end.

I ran the test with `commandTimeout: 15000` (the current production setting). Jobs processed fine. Then during the monitoring period: timeout errors. Several of them. About 25-30 seconds apart. Just like in production.

The test failed with a clear message: "Queue is entering a timeout loop. NOT SAFE FOR PRODUCTION."

## The Real Fix: commandTimeout

I'd seen recommendations online to set `commandTimeout: 0` to disable the timeout entirely since Bull manages its own timeouts. I tried that. The test script failed during setup with a timeout error. Apparently, setting it to zero doesn't work the way I expected with ioredis.

What if I set it really high? Bull's blocking operations take at most 5 seconds plus network latency. What if I set the timeout to 5 minutes (300,000 milliseconds)? That would give Bull plenty of room for its blocking operations while still having a timeout in case something goes genuinely wrong.

I updated both the production and development Redis configurations to use `commandTimeout: 300000`. I ran the test script again.

Jobs added to queue. Jobs processed successfully. Monitoring period started. 60 seconds passed. 59, 58, 57... all the way down to 0. Zero timeout errors. The test passed.

"TEST PASSED! All jobs processed successfully. No timeout errors after job completion. Worker continues waiting without errors. Queue is healthy and ready for production."

I deployed the change. Watched the production logs. Jobs processed. Then silence. Clean logs. No timeout errors. The worker was waiting quietly for the next job, exactly as it should.

## Lessons Learned the Hard Way

### Don't blindly apply optimizations

I added `lazyConnect: true` because I saw it in multiple Redis optimization guides. It's supposed to improve connection pooling and reduce connection overhead. Those guides weren't wrong—for their use cases. But for Bull's blocking worker pattern, it was fundamentally incompatible. I cargo-culted an optimization without understanding when it applied and when it didn't.

The same thing happened with `commandTimeout: 15000`. I'd seen recommendations to add timeouts to prevent hanging connections. Good advice in general. But Bull's blocking operations need time to block. A timeout that's too short defeats the purpose.

### Reproduce in isolation

The breakthrough came when I created standalone test scripts. This removed all the NestJS complexity and let me focus purely on Bull plus Redis. Within 30 minutes of creating that first script, I'd identified that Bull worked fine in isolation, which meant the problem was in my configuration. That insight saved hours.

When something doesn't work in a complex system, strip it down to the basics. Remove the framework, remove the dependencies, remove everything except the core pieces. If it works in isolation, the problem is in the integration. If it doesn't work in isolation, the problem is more fundamental.

### Log everything during debugging

Those diagnostic logs were crucial. Without them, I would never have known that jobs were being queued but not processed. I would have kept chasing Redis connection issues. The logs showed the exact state of the system at each step. Job queued. Job active. Job completed. Then nothing—or in the second bug, timeout errors.

When debugging production, log state transitions aggressively. Yes, it makes logs noisy. Yes, you'll remove most of them later. But during active debugging, you need visibility. You can't attach a debugger to production. Logs are your eyes.

### Read the source code

I spent hours reading blog posts about Bull configuration. Most were outdated or wrong or addressed different problems. Finally, I cloned the Bull repository and read how it actually uses Redis. That's when I understood the blocking command requirement and why lazy connections would break it.

Documentation and blog posts get out of date. People write about their specific issues, and you assume your issue is the same. Source code doesn't lie. It shows exactly what happens. If you're stuck, go read the source.

### Test your assumptions

I assumed my Redis connection was working because jobs were being queued. But queuing and processing use different connection patterns. Queuing uses simple LPUSH commands. Processing uses BRPOPLPUSH, which requires a persistent blocking connection. They have different requirements.

Split your assumptions into testable pieces. Test each one. Don't assume that because part A works, part B must also work. They might use the system in completely different ways.

### Write tests before deploying fixes

After getting burned by the timeout loop issue, I wrote a comprehensive test script before deploying the commandTimeout fix. The test ran locally, confirmed the fix worked, and gave me confidence to deploy. That 60-second test saved me from another round of debugging in production.

If you're fixing a production bug, write a test that reproduces it first. Fix the bug locally. Confirm the test passes. Then deploy. This seems obvious, but when you're in the heat of debugging at 2 AM, it's easy to skip.

## The Emotional Rollercoaster

I want to be honest about how this felt. The first day was frustrating but manageable. I was methodically trying solutions, confident I'd find the fix. The second day was worse. Every fix failed. I was starting to doubt my understanding of the system. Was Bull not compatible with Upstash? Was there something fundamentally wrong with my architecture?

When I finally found the lazyConnect issue and saw emails working in production, I was elated. I felt like I'd conquered the mountain. Then the next morning, seeing hundreds of timeout errors in the logs, I felt defeated. The fix hadn't fixed anything. I'd just moved the problem around.

Writing the timeout loop test and seeing it pass was the turning point. I had proof the fix worked before deploying. I had a tool to verify behavior. I wasn't just throwing changes at production and hoping. That feeling of control made all the difference.

## Was It Worth It?

Two days. Over 16 hours of debugging. All for one configuration flag and one timeout value.

But here's what I learned. I understand how Bull uses blocking Redis commands. I know why connection timing matters for blocking operations. I can explain the difference between queue producers and consumers. I know how to debug production issues systematically. I understand that not every optimization applies to every use case.

Was it frustrating? Absolutely. Would I rather have spent those two days building features? Sure. But now I have a rock-solid email system and the knowledge to debug similar issues in seconds. The next time I see "Command timed out" or jobs not processing, I'll know exactly where to look.

And I have test scripts that can verify Bull queue health in 60 seconds. That alone is worth the time invested.

## For Anyone Googling This

If you found this post because your Bull queue isn't processing jobs with Upstash Redis or any other Redis provider, here's what you need to check:

First, make sure `lazyConnect` is set to false or not set at all. Bull workers need established connections immediately because they use blocking Redis commands. Lazy connections will cause workers to never pick up jobs.

Second, make sure your `commandTimeout` is high enough for Bull's blocking operations. Bull blocks for about 5 seconds per operation. Add network latency. If your timeout is too short, you'll get an infinite loop of timeout errors. Set it to 300,000 milliseconds (5 minutes) or higher.

Third, set `maxRetriesPerRequest: null`. Bull handles its own retry logic. The ioredis retry mechanism will interfere.

Fourth, if you're using TLS (like with Upstash), just set `tls: {}`. Don't try to configure certificates or rejection rules unless you have a specific reason.

Here's the final working configuration:

```typescript
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

        // Critical options for Bull workers
        maxRetriesPerRequest: null,
        lazyConnect: false,
        commandTimeout: 300000,

        // Performance tuning
        enableReadyCheck: false,
        retryDelayOnFailover: 1000,
        keepAlive: 30000,
        connectTimeout: 60000,
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
});
```

Test it with the timeout loop test script I described. Add jobs, process them, monitor for 60 seconds after completion. If you see zero timeout errors, you're good to deploy.

Good luck. May your queues always process and your timeouts never fire.

Written while the pain is still fresh, so hopefully you can avoid it.
