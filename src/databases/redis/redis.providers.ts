import config from '@configs/configuration';
import { Redis } from 'ioredis';

export const REDIS_PROVIDER = {
  CACHE: 'REDIS_CACHE_PROVIDER',
  PRICE: 'REDIS_PRICE_PROVIDER',
};

export const RedisCacheProvider = {
  provide: REDIS_PROVIDER.CACHE,
  useFactory: () => {
    return new Redis(config.REDIS.CACHE.URI);
  },
};

export const RedisPriceProvider = {
  provide: REDIS_PROVIDER.PRICE,
  useFactory: () => {
    return new Redis(config.REDIS.PRICE.URI);
  },
};
