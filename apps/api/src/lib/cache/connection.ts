import KeyvRedis from "@keyv/redis";
import "../../env";

export const getRedisConnection = ():
  | InstanceType<typeof KeyvRedis>
  | undefined => {
  if (process.env.REDIS_URL) {
    return new KeyvRedis(process.env.REDIS_URL);
  }

  if (process.env.REDIS_HOST) {
    const redisConfig: {
      host: string;
      port?: number;
      password?: string;
      db?: number;
    } = {
      host: process.env.REDIS_HOST,
    };

    if (process.env.REDIS_PORT) {
      redisConfig.port = Number.parseInt(process.env.REDIS_PORT, 10);
    }

    if (process.env.REDIS_PASSWORD) {
      redisConfig.password = process.env.REDIS_PASSWORD;
    }

    if (process.env.REDIS_DB) {
      redisConfig.db = Number.parseInt(process.env.REDIS_DB, 10);
    }

    return new KeyvRedis(redisConfig);
  }

  return undefined;
};
