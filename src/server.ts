import http from 'http'
import events from 'events'
import express from 'express'
import { DidResolver, MemoryCache } from '@atproto/identity'
import { createServer } from './lexicon'
import feedGeneration from './methods/feed-generation'
import describeGenerator from './methods/describe-generator'
import { FirehoseSubscription } from './subscription'
import { AppContext, Config } from './config'
import wellKnown from './well-known'
import {RedisClient} from "./cache/redis-client";
import {HashtagBot} from "./bot/hashtag-bot";
import cron from 'node-cron'

export class FeedGenerator {
  public app: express.Application
  public server?: http.Server
  public cache: RedisClient
  public firehose: FirehoseSubscription
  public cfg: Config
  public bot: HashtagBot

  constructor(
    app: express.Application,
    cache: RedisClient,
    firehose: FirehoseSubscription,
    cfg: Config,
  ) {
    this.app = app
    this.cache = cache
    this.firehose = firehose
    this.cfg = cfg
    this.bot = new HashtagBot(cfg, cache);
  }

  static create(cfg: Config) {
    const app = express()
    const cache = new RedisClient({
      host: cfg.redisHost,
      port: cfg.redisPort,
      username: cfg.redisUsername,
      password: cfg.redisPassword
    });
    const firehose = new FirehoseSubscription(cache, cfg.subscriptionEndpoint)

    const didCache = new MemoryCache()
    const didResolver = new DidResolver({
      plcUrl: 'https://plc.directory',
      didCache,
    })

    const server = createServer({
      validateResponse: true,
      payload: {
        jsonLimit: 100 * 1024, // 100kb
        textLimit: 100 * 1024, // 100kb
        blobLimit: 5 * 1024 * 1024, // 5mb
      },
    })
    const ctx: AppContext = {
      cache,
      didResolver,
      cfg,
    }
    feedGeneration(server, ctx)
    describeGenerator(server, ctx)
    app.use(server.xrpc.router)
    app.use(wellKnown(ctx))

    return new FeedGenerator(app, cache, firehose, cfg)
  }

  async start(): Promise<http.Server> {
    await this.cache.initialize();
    this.firehose.run(this.cfg.subscriptionReconnectDelay)
    this.server = this.app.listen(this.cfg.port, this.cfg.listenhost)
    await events.once(this.server, 'listening')
    cron.schedule('0 */3 * * *', async () => {
      try {
        await this.bot.refreshTopHashtags()
      } catch (error) {
        console.error('Failed to refresh top hashtags:', error)
      }
    })
    return this.server
  }
}

export default FeedGenerator
