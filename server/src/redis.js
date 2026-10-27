import IORedis from 'ioredis';
import { config } from './config.js';
import { log } from './logger.js';
import { newId } from './utils.js';

export function makeRedis() {
  const r = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
  r.on('error', (e) => log.error('redis:', e.message));
  return r;
}

let shared = null;
export const redis = () => (shared ||= makeRedis());

const RELEASE = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

// Cross-instance mutex: SET NX with an expiry, released only by its owner.
export async function withRedisLock(key, fn, { ttlMs = 10000, waitMs = 5000 } = {}) {
  const r = redis();
  const token = newId();
  const k = `lock:${key}`;
  const deadline = Date.now() + waitMs;
  while (!(await r.set(k, token, 'PX', ttlMs, 'NX'))) {
    if (Date.now() > deadline) throw new Error(`Could not acquire lock ${key}`);
    await new Promise((res) => setTimeout(res, 80));
  }
  try {
    return await fn();
  } finally {
    await r.eval(RELEASE, 1, k, token).catch(() => {});
  }
}
