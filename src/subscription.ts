import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  private extractHashtags(text: string): string[] {
    const hashtagRegex = /#[a-zA-Z0-9_]+/g
    const matches = text.match(hashtagRegex) || [];
    return Array.from(new Set<string>(
        matches.filter(tag => tag.length > 3)
    ));
  }

  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return

    const ops = await getOpsByType(evt)

    for (const post of ops.posts.creates) {
      const hashtags = this.extractHashtags(post.record.text)

      await Promise.all(
          hashtags.map(hashtag =>
              this.redisClient.trackHashtag(hashtag)
          )
      )
    }
  }
}
