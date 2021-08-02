import { createClient } from 'redis';

const redisClient = createClient({ host: process.env.REDIS_URL, port: process.env.REDIS_PORT });

export function getOrSetRedisKey(key, cb) {
  return new Promise((resolve, reject) => {
    redisClient.get(key, async (error, data) => {
      if (error) return reject(error);
      if (data != null) return resolve(JSON.parse(data));
      const freshData = await cb();
      redisClient.setex(key, -1, JSON.stringify(freshData));
      resolve(freshData);
    });
  });
}

export function setRedisKey(key, value) {
  return new Promise(async (resolve, reject) => {
    redisClient.set(key, JSON.stringify(value), async (error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

export function getRedisKey(key) {
  return new Promise(async (resolve, reject) => {
    redisClient.get(key, async (error, value) => {
      if (error) return reject(error);
      if (value != null) return resolve(JSON.parse(value));
      resolve(null);
    });
  });
}

export default redisClient;