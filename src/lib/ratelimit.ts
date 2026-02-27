import 'server-only'

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Single shared Redis instance for all rate limiters
const redis = Redis.fromEnv()

/** Auth endpoints: 30 requests per 15 minutes */
export const authLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '15 m'),
  prefix: 'rl:auth',
})

/** API mutations: 100 requests per minute */
export const mutationLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 m'),
  prefix: 'rl:mutation',
})

/** Read endpoints: 300 requests per minute */
export const readLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(300, '1 m'),
  prefix: 'rl:read',
})

/** AI pipeline trigger: 5 requests per 60 seconds per user (sliding window) */
export const aiPipelineLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '60 s'),
  prefix: 'rl:ai_pipeline',
})

/** AI L2 per-project: 100 requests per hour */
export const aiL2ProjectLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 h'),
  prefix: 'rl:ai_l2',
})

/** AI L3 per-project: 50 requests per hour */
export const aiL3ProjectLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(50, '1 h'),
  prefix: 'rl:ai_l3',
})
