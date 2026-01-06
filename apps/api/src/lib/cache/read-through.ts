import Keyv, { type KeyvStoreAdapter } from "keyv";
import { getRedisConnection } from "./connection.js";

export interface ReadThroughCacheOptions<I, O> {
  /**
   * Namespace for cache keys to avoid collisions
   */
  namespace: string;
  /**
   * Function to fetch data when cache miss occurs
   */
  fetch: (input: I) => Promise<O>;
  /**
   * Time to live in milliseconds
   */
  ttl?: number; // Default 1 hour
  /**
   * Stale-while-revalidate window in milliseconds.
   * If defined and greater than 0, stale data within this window will be returned
   * while revalidating in the background.
   */
  swr?: number;
  /**
   * Custom key generator function
   */
  keyGenerator?: (input: I) => string;
  /**
   * Custom cache store (defaults to Redis if available, otherwise in-memory)
   */
  store?: KeyvStoreAdapter;
  /**
   * Whether to cache errors (defaults to false)
   */
  cacheErrors?: boolean;
  /**
   * TTL for cached errors in milliseconds (defaults to ttl / 10)
   */
  errorTtl?: number;
}

interface CachedValue<T> {
  data: T;
  timestamp: number;
  stale?: boolean;
}

export class ReadThroughCache<I, O> {
  private cache: Keyv<CachedValue<O>>;
  private namespace: string;
  private fetch: (input: I) => Promise<O>;
  private ttl: number;
  private swr: number | undefined;
  private keyGenerator: (input: I) => string;
  private cacheErrors: boolean;
  private errorTtl: number;
  private revalidationPromises: Map<string, Promise<O>> = new Map();

  constructor(options: ReadThroughCacheOptions<I, O>) {
    this.namespace = options.namespace;
    this.fetch = options.fetch;
    this.ttl = options.ttl ?? 3600000; // Default 1 hour
    this.swr = options.swr && options.swr > 0 ? options.swr : undefined;
    this.cacheErrors = options.cacheErrors ?? false;
    this.errorTtl = options.errorTtl ?? Math.max(this.ttl / 10, 60000); // Default 10% of ttl or 1 minute

    this.keyGenerator =
      options.keyGenerator ??
      ((input: I) =>
        typeof input === "string" ? input : JSON.stringify(input));

    const redisConnection = getRedisConnection();
    const store = options.store ?? redisConnection;

    this.cache = new Keyv<CachedValue<O>>({
      ...(store ? { store } : {}),
      namespace: this.namespace,
      ttl: this.ttl,
    });
  }

  /**
   * Get value from cache or fetch if not found
   */
  async get(input: I): Promise<O> {
    const cacheKey = this.getCacheKey(input);

    try {
      const cached = await this.cache.get(cacheKey);

      if (cached) {
        const age = Date.now() - cached.timestamp;
        const isStale = age > this.ttl;
        const isWithinSwrWindow =
          this.swr !== undefined && age <= this.ttl + this.swr;

        if (!isStale) {
          // Fresh data, return immediately
          return cached.data;
        }

        if (isWithinSwrWindow) {
          // Stale data within SWR window, return stale and revalidate in background
          this.revalidate(input, cacheKey).catch(() => {
            // Silently handle revalidation errors
          });
          return cached.data;
        }

        // Stale data beyond SWR window, fetch fresh data
        return await this.revalidate(input, cacheKey);
      }

      // Cache miss, fetch and cache
      return await this.fetchAndCache(input, cacheKey);
    } catch (error) {
      // If cache read fails, try to fetch directly
      if (this.cacheErrors && error instanceof Error) {
        const errorKey = `${cacheKey}:error`;
        const cachedError = await this.cache.get(errorKey);
        if (cachedError) {
          throw cachedError.data;
        }
      }

      try {
        const data = await this.fetch(input);
        await this._set(cacheKey, data);
        return data;
      } catch (fetchError) {
        if (this.cacheErrors) {
          await this._set(`${cacheKey}:error`, fetchError as O, this.errorTtl);
        }
        throw fetchError;
      }
    }
  }

  /**
   * Set value in cache
   */
  async set(input: I, value: O, ttl?: number): Promise<void> {
    const cacheKey = this.getCacheKey(input);

    await this._set(cacheKey, value, ttl);
  }

  private async _set(cacheKey: string, value: O, ttl?: number): Promise<void> {
    const cachedValue: CachedValue<O> = {
      data: value,
      timestamp: Date.now(),
    };

    await this.cache.set(cacheKey, cachedValue, ttl ?? this.ttl);
  }

  /**
   * Delete value from cache
   */
  async delete(input: I): Promise<void> {
    const cacheKey = this.getCacheKey(input);
    await this._delete(cacheKey);
  }

  private async _delete(cacheKey: string): Promise<void> {
    await this.cache.delete(cacheKey);
    await this.cache.delete(`${cacheKey}:error`);
  }

  /**
   * Clear all keys in this namespace
   */
  async clear(): Promise<void> {
    await this.cache.clear();
  }

  /**
   * Check if key exists in cache
   */
  async has(input: I): Promise<boolean> {
    const cacheKey = this.getCacheKey(input);
    return this.cache.has(cacheKey);
  }

  /**
   * Get multiple values at once
   */
  async getMany(inputs: I[]): Promise<(O | undefined)[]> {
    return Promise.all(
      inputs.map((input) => this.get(input).catch(() => undefined))
    );
  }

  /**
   * Set multiple values at once
   */
  async setMany(
    entries: Array<{ input: I; value: O; ttl?: number }>
  ): Promise<void> {
    await Promise.all(
      entries.map(({ input, value, ttl }) => this.set(input, value, ttl))
    );
  }

  /**
   * Delete multiple keys at once
   */
  async deleteMany(inputs: I[]): Promise<void> {
    await Promise.all(inputs.map((input) => this.delete(input)));
  }

  /**
   * Invalidate cache and force refresh on next get
   */
  async invalidate(input: I): Promise<void> {
    await this.delete(input);
  }

  private getCacheKey(input: I): string {
    return this.keyGenerator(input);
  }

  private async fetchAndCache(input: I, cacheKey: string): Promise<O> {
    const data = await this.fetch(input);
    await this._set(cacheKey, data);
    return data;
  }

  private async revalidate(input: I, cacheKey: string): Promise<O> {
    const existingRevalidation = this.revalidationPromises.get(cacheKey);
    if (existingRevalidation) {
      return existingRevalidation;
    }

    const revalidationPromise = this.fetchAndCache(input, cacheKey).finally(
      () => {
        this.revalidationPromises.delete(cacheKey);
      }
    );

    this.revalidationPromises.set(cacheKey, revalidationPromise);
    return revalidationPromise;
  }
}

/**
 * Create a read-through cache instance
 */
export const createReadThroughCache = <I, O>(
  options: ReadThroughCacheOptions<I, O>
): ReadThroughCache<I, O> => {
  return new ReadThroughCache(options);
};
