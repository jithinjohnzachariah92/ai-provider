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

export type CacheStats = {
  hits: number
  misses: number
  evictions: number
  expirations: number
  size: number
  hitRate: number
}

export class BoundedCache {
  private store = new Map<string, CacheEntry<unknown>>()
  private readonly maxSize: number
  private readonly ttlMs: number

  // Observability counters
  private hits = 0
  private misses = 0
  private evictions = 0
  private expirations = 0

  constructor(maxSize?: number, ttlMs?: number) {
    this.maxSize = maxSize ?? parseInt(process.env.AI_CACHE_MAX_SIZE ?? '500', 10)
    this.ttlMs = ttlMs ?? parseInt(process.env.AI_CACHE_TTL_MS ?? String(5 * 60 * 1000), 10)
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) {
      this.misses++
      return null
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      this.expirations++
      this.misses++
      return null
    }

    // LRU: re-insert to refresh recency
    this.store.delete(key)
    this.store.set(key, entry)

    this.hits++
    return entry.value as T
  }

  set<T>(key: string, value: T): void {
    if (this.store.has(key)) {
      this.store.delete(key)
    } else if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey) {
        this.store.delete(oldestKey)
        this.evictions++
      }
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
    this.hits = 0
    this.misses = 0
    this.evictions = 0
    this.expirations = 0
  }

  get size(): number {
    return this.store.size
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses
    return { hits: this.hits, misses: this.misses, evictions: this.evictions, expirations: this.expirations, size: this.store.size, hitRate: total > 0 ? +(this.hits / total).toFixed(3) : 0 }
  }
}



// Singleton instance used by the gateway
export const responseCache = new BoundedCache()
