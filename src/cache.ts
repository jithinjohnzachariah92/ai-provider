/// <reference types="node" />

/**
 * Bounded in-memory cache with TTL and max size.
 *
 * Defaults:
 *   maxSize: 500 entries    — prevents unbounded memory growth
 *   ttl:     5 minutes      — stale responses don't persist across deploys
 *
 * Override via env vars:
 *   AI_CACHE_MAX_SIZE=1000
 *   AI_CACHE_TTL_MS=60000   (1 minute)
 *
 * For persistence across restarts (production), swap this for Redis/Upstash
 * by implementing the same CacheStore interface.
 */

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

export class BoundedCache {
  private store = new Map<string, CacheEntry<unknown>>()
  private readonly maxSize: number
  private readonly ttlMs: number

  constructor(maxSize?: number, ttlMs?: number) {
    this.maxSize = maxSize ?? parseInt(process.env.AI_CACHE_MAX_SIZE ?? '500', 10)
    this.ttlMs   = ttlMs   ?? parseInt(process.env.AI_CACHE_TTL_MS  ?? String(5 * 60 * 1000), 10)
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null

    // Expired — remove and return null
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }

    return entry.value as T
  }

  set<T>(key: string, value: T): void {
    // Evict oldest entry if at capacity
    if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey) this.store.delete(oldestKey)
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    })
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  /** Clear all entries — useful between tests */
  clear(): void {
    this.store.clear()
  }

  get size(): number {
    return this.store.size
  }
}

// Singleton instance used by the gateway
export const responseCache = new BoundedCache()
