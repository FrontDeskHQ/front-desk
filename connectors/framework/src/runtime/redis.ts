import { Queue, Worker } from "bullmq";
import type { Processor, QueueOptions, WorkerOptions } from "bullmq";
import Redis from "ioredis";
import type { RedisOptions } from "ioredis";

export type { Job, Queue, Worker } from "bullmq";

/** Map a `redis(s)://` URL onto the ioredis options BullMQ understands. */
const parseRedisUrl = (url: string): RedisOptions => {
  const parsed = new URL(url);
  const options: RedisOptions = { host: parsed.hostname };

  if (parsed.port) {
    options.port = Number.parseInt(parsed.port, 10);
  }
  if (parsed.username) {
    options.username = decodeURIComponent(parsed.username);
  }
  if (parsed.password) {
    options.password = decodeURIComponent(parsed.password);
  }

  const db = parsed.pathname.replace(/^\//, "");
  if (db) {
    options.db = Number.parseInt(db, 10);
  }
  if (parsed.protocol === "rediss:") {
    options.tls = {};
  }

  // Carry query options through (e.g. `?family=6` for IPv6), matching ioredis's
  // own URL parsing which copies search params onto the connection options.
  // Numeric-looking values are coerced so `family`/`connectTimeout`/etc. arrive
  // as numbers rather than strings.
  for (const [key, value] of parsed.searchParams) {
    (options as Record<string, unknown>)[key] = /^\d+$/.test(value)
      ? Number.parseInt(value, 10)
      : value;
  }

  return options;
};

/**
 * Resolve BullMQ connection options from the environment: prefer `REDIS_URL`
 * (parsed into ioredis options — BullMQ does not honour a bare `{ url }`), fall
 * back to discrete host/port/password/db env vars. `maxRetriesPerRequest: null`
 * is required by Workers and harmless for Queues. Returning a descriptor (not a
 * pre-built instance) lets BullMQ own the connection and close its socket on
 * `Queue`/`Worker` `.close()`.
 */
export const getRedisConnectionOptions = (): RedisOptions & {
  maxRetriesPerRequest: null;
} => {
  const base: RedisOptions = process.env.REDIS_URL
    ? parseRedisUrl(process.env.REDIS_URL)
    : {
        host: process.env.REDIS_HOST ?? "localhost",
        ...(process.env.REDIS_PORT
          ? { port: Number.parseInt(process.env.REDIS_PORT, 10) }
          : {}),
        ...(process.env.REDIS_PASSWORD
          ? { password: process.env.REDIS_PASSWORD }
          : {}),
        ...(process.env.REDIS_DB
          ? { db: Number.parseInt(process.env.REDIS_DB, 10) }
          : {}),
      };

  return { ...base, maxRetriesPerRequest: null };
};

/**
 * Create an owned ioredis instance for callers that wire their own Queue/Worker
 * and manage its lifecycle. Replaces github's `createRedisConnection`.
 */
export const createRedisConnection = (): Redis =>
  new Redis(getRedisConnectionOptions());

/**
 * Create a BullMQ Queue. BullMQ constructs and owns the connection from the
 * descriptor, so it closes the socket on `queue.close()`. Connector-specific job
 * data and default options are passed through.
 */
export const createQueue = <T>(
  name: string,
  options?: Omit<QueueOptions, "connection">
): Queue<T> =>
  new Queue<T>(name, { connection: getRedisConnectionOptions(), ...options });

/**
 * Create a BullMQ Worker. BullMQ constructs and owns the connection from the
 * descriptor, so it closes the socket on `worker.close()`. The processor and any
 * connector-specific concurrency/limiter options are passed through.
 */
export const createWorker = <T, R = unknown>(
  name: string,
  processor: Processor<T, R>,
  options?: Omit<WorkerOptions, "connection">
): Worker<T, R> =>
  new Worker<T, R>(name, processor, {
    connection: getRedisConnectionOptions(),
    ...options,
  });
