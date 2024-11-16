import { createClient, RedisClientOptions } from 'redis';
type RedisClientType = ReturnType<typeof createClient>;

interface RedisConfig {
    host: string;
    port: number;
    password: string;
    username: string;
}

interface HashtagCount {
    hashtag: string;
    count: number;
}

export class RedisClient {
    private client: RedisClientType;
    private readonly BUCKET_PREFIX = 'hashtag_bucket:';
    private readonly BUCKET_DURATION_MS = 60 * 60 * 1000;
    private readonly CURSOR_PREFIX = 'firehose_cursor:';

    constructor(config: RedisConfig) {
        const { host = 'localhost', port = 6379, password, username } = config;

        const clientOptions: RedisClientOptions = {
            socket: {
                host,
                port,
            },
            password,
            username,
        };

        this.client = createClient(clientOptions);

        this.client.on('error', (err) => console.error('Redis Client Error:', err));
        this.client.on('connect', () => console.log('Redis Client Connected'));
    }

    async initialize(): Promise<void> {
        await this.client.connect();
    }

    async shutdown(): Promise<void> {
        await this.client.quit();
    }

    async trackHashtag(hashtag: string): Promise<number> {
        const currentBucketKey = await this.getCurrentOrCreateBucket();
        return await this.client.hIncrBy(currentBucketKey, hashtag, 1);
    }

    async getCursor(service: string): Promise<number | null> {
        const cursor = await this.client.get(`${this.CURSOR_PREFIX}${service}`);
        return cursor ? parseInt(cursor, 10) : null;
    }

    async updateCursor(service: string, cursor: number): Promise<void> {
        await this.client.set(`${this.CURSOR_PREFIX}${service}`, cursor.toString());
    }

    private async getCurrentOrCreateBucket(): Promise<string> {
        const currentTimestamp = Date.now();
        const bucketTimestamp = Math.floor(currentTimestamp / this.BUCKET_DURATION_MS) * this.BUCKET_DURATION_MS;
        const bucketKey = `${this.BUCKET_PREFIX}${bucketTimestamp}`;

        const exists = await this.client.exists(bucketKey);

        if (!exists) {
            const expirationBuffer = 5 * 60;
            const bucketTTL = Math.floor(this.BUCKET_DURATION_MS / 1000) + expirationBuffer;

            await this.client.zAdd('hashtag_buckets', [{
                score: bucketTimestamp,
                value: bucketKey
            }]);

            await this.client.expire(bucketKey, bucketTTL);
            await this.client.expire('hashtag_buckets', bucketTTL);

            const oldBucketThreshold = currentTimestamp - this.BUCKET_DURATION_MS;
            await this.client.zRemRangeByScore(
                'hashtag_buckets',
                oldBucketThreshold.toString(),
                '-inf'
            );
        }

        return bucketKey;
    }

    async getTopHashtags(limit: number = 30): Promise<HashtagCount[]> {
        const currentTimestamp = Date.now();
        const twentyFourHoursAgo = currentTimestamp - (24 * 60 * 60 * 1000);

        const bucketKeys = await this.client.zRangeByScore(
            'hashtag_buckets',
            twentyFourHoursAgo.toString(),
            currentTimestamp.toString()
        );

        if (!bucketKeys.length) {
            return [];
        }

        const aggregatedCounts = new Map<string, number>();

        for (const bucketKey of bucketKeys) {
            const hashtagCounts = await this.client.hGetAll(bucketKey);

            for (const [hashtag, count] of Object.entries(hashtagCounts)) {
                const currentCount = aggregatedCounts.get(hashtag) || 0;
                if (typeof count === 'string') {
                    aggregatedCounts.set(hashtag, currentCount + parseInt(count, 10));
                }
            }
        }

        return Array.from(aggregatedCounts.entries())
            .map(([hashtag, count]) => ({
                hashtag,
                count
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }
}