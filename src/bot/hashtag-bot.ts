import { Bot } from "@skyware/bot";
import { Config } from "../config";
import { RedisClient } from "../cache/redis-client";
import { v4 as uuidv4 } from 'uuid';
import numeral from 'numeral';

export class HashtagBot {
    private bot: Bot;
    private username: string;
    private password: string;
    private isLoggedIn: boolean;
    private cache: RedisClient;

    constructor(config: Config, cache: RedisClient) {
        this.bot = new Bot();
        this.username = config.bskyUsername;
        this.password = config.bskyPassword;
        this.isLoggedIn = false;
        this.cache = cache;
    }

    async refreshTopHashtags(): Promise<void> {
        if (!this.isLoggedIn) {
            await this.bot.login({
                identifier: this.username,
                password: this.password
            });
            this.isLoggedIn = true;
        }

        const iterationId = uuidv4();
        const topHashtags = await this.cache.getTopHashtags();
        const sortedHashtags = [...topHashtags].sort((a, b) => a.count - b.count);

        const successfulPosts = [];

        for (const { hashtag, count } of sortedHashtags) {
            try {
                const formattedCount = numeral(count).format('0.[0]a');
                const post = await this.bot.post({
                    text: `${hashtag} - ${formattedCount} posts`
                });

                if (post?.cid) {
                    successfulPosts.push({
                        hashtag,
                        count,
                        uri: post.uri,
                    });
                }

                await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (error) {
                console.error(`Failed to post hashtag ${hashtag}:`, error);
            }
        }

        if (successfulPosts.length > 0) {
            await this.cache.storeHashtagPosts(iterationId, successfulPosts);
            await this.cache.setCurrentIterationId(iterationId);
            await this.cache.expireOldIterations(iterationId)
        }
    }
}