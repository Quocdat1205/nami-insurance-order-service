import { CacheModule as NestjsCacheModules } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { RedisModule } from '@databases/redis/redis.module';
import { MongoDBModule } from '@databases/mongo/mongo.module';
import { ESModule } from '@databases/elastic/elastic.module';
import config from '@configs/configuration';
import { LoggerModule } from '@commons/modules/logger/logger.module';
import { CacheModule } from '@commons/modules/cache/cache.module';
import { LockModule } from '@commons/modules/lock/lock.module';
import * as redisStore from 'cache-manager-redis-store';
import type { RedisClientOptions } from 'redis';
import { DevtoolsModule } from '@nestjs/devtools-integration';
import { ThrottlerModule } from '@nestjs/throttler';
import { SECONDS_TO_MILLISECONDS } from '@commons/constants';

const BaseModules = [
  ConfigModule.forRoot({
    isGlobal: true,
  }),
  BullModule.forRoot({
    url: config.REDIS.CACHE.URI,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: true,
    },
  }),
  NestjsCacheModules.register<RedisClientOptions>({
    store: redisStore,
    url: config.REDIS.CACHE.URI,
    ttl: config.REDIS.CACHE.EXPIRE_TIME,
    isGlobal: true,
  }),
  DevtoolsModule.register({
    http: !config.IS_PRODUCTION,
  }),
  ThrottlerModule.forRoot([
    {
      ttl: SECONDS_TO_MILLISECONDS.TEN,
      limit: config.NICE,
    },
  ]),
];

const DatabaseModules = [MongoDBModule, RedisModule, ESModule];

const CommonModules = [CacheModule, LoggerModule, LockModule];

export const RootModules = [
  ...BaseModules,
  ...DatabaseModules,
  ...CommonModules,
];
