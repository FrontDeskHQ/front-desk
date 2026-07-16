import {
  type Processor,
  Queue,
  type QueueOptions,
  Worker,
  type WorkerOptions,
} from "bullmq";
import Redis, { type RedisOptions } from "ioredis";

export type { Job, Queue, Worker } from "bullmq";

/**
 * BullMQ connection descriptor: prefer `REDIS_URL`, fall back to discrete
 * host/port/password/db env vars. Passed as `connection` to a Queue/Worker,
 * where BullMQ builds and manages the underlying ioredis instance itself.
 */
export type RedisConnection =
  | { url: string }
  | { host: string; port?: number; password?: string; db?: number };

/**
 * Resolve the shared connection descriptor from the environment. Replaces the
 * per-connector `getRedisConnection` copies (discord/slack).
 */
export const getRedisConnection = (): RedisConnection => {
  if (process.env.REDIS_URL) {
    return { url: process.env.REDIS_URL };
  }

  return {
    host: process.env.REDIS_HOST ?? "localhost",
    port: process.env.REDIS_PORT
      ? Number.parseInt(process.env.REDIS_PORT, 10)
      : 6379,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB ? Number.parseInt(process.env.REDIS_DB, 10) : 0,
  };
};

/**
 * Create an owned ioredis instance configured for BullMQ
 * (`maxRetriesPerRequest: null` is required when passing an instance, rather
 * than a descriptor, to a Queue/Worker). Replaces github's `createRedisConnection`.
 */
export const createRedisConnection = (): Redis => {
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  }

  const options: RedisOptions & { maxRetriesPerRequest: null } = {
    host: process.env.REDIS_HOST ?? "localhost",
    maxRetriesPerRequest: null,
  };

  if (process.env.REDIS_PORT) {
    options.port = Number.parseInt(process.env.REDIS_PORT, 10);
  }
  if (process.env.REDIS_PASSWORD) {
    options.password = process.env.REDIS_PASSWORD;
  }
  if (process.env.REDIS_DB) {
    options.db = Number.parseInt(process.env.REDIS_DB, 10);
  }

  return new Redis(options);
};

/**
 * Create a BullMQ Queue wired to the shared connection. Connector-specific job
 * data and default options are passed through.
 */
export const createQueue = <T>(
  name: string,
  options?: Omit<QueueOptions, "connection">,
): Queue<T> =>
  new Queue<T>(name, { connection: getRedisConnection(), ...options });

/**
 * Create a BullMQ Worker wired to the shared connection. The processor and any
 * connector-specific concurrency/limiter options are passed through.
 */
export const createWorker = <T, R = unknown>(
  name: string,
  processor: Processor<T, R>,
  options?: Omit<WorkerOptions, "connection">,
): Worker<T, R> =>
  new Worker<T, R>(name, processor, {
    connection: getRedisConnection(),
    ...options,
  });
