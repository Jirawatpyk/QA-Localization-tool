import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

function createRedis() {
  return Redis.fromEnv()
}

/** Auth endpoints: 30 requests per 15 minutes */
export const authLimiter = new Ratelimit({
  redis: createRedis(),
  limiter: Ratelimit.slidingWindow(30, '15 m'),
  prefix: 'rl:auth',
})

/** API mutations: 100 requests per minute */
export const mutationLimiter = new Ratelimit({
  redis: createRedis(),
  limiter: Ratelimit.slidingWindow(100, '1 m'),
  prefix: 'rl:mutation',
})

/** Read endpoints: 300 requests per minute */
export const readLimiter = new Ratelimit({
  redis: createRedis(),
  limiter: Ratelimit.slidingWindow(300, '1 m'),
  prefix: 'rl:read',
})
