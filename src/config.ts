import { DidResolver } from '@atproto/identity'
import {RedisClient} from "./cache/redis-client";

export type AppContext = {
  cache: RedisClient
  didResolver: DidResolver
  cfg: Config
}

export type Config = {
  port: number
  listenhost: string
  hostname: string
  subscriptionEndpoint: string
  serviceDid: string
  publisherDid: string
  subscriptionReconnectDelay: number
  redisHost: string;
  redisPort: number;
  redisPassword: string;
  redisUsername?: string;
  bskyUsername: string;
  bskyPassword: string;
}
