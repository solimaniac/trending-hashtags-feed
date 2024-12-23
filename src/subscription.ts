import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
import { Record } from './lexicon/types/app/bsky/feed/post'
import badwords from 'badwords-list';

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  private readonly labelFilter = [
    'sexual',
    'porn',
    'nudity',
    'graphic-media',
  ];

  private readonly contentFilter = [
    'nsfw',
    'nude',
    'onlyfans',
    'aiart',
    'furry',
    'body',
    'leiarcaica',
    ...badwords.array
  ];

  private extractHashtags(text: string): string[] {
    const hashtagRegex = /#[a-zA-Z0-9_]+/g
    const matches = text.match(hashtagRegex) || [];
    return Array.from(new Set<string>(
        matches
            .filter((tag: string) => tag.length > 3)
            .filter((tag: string) => !this.contentFilter.some(filter => tag.toLowerCase().includes(filter)))
            .map((tag: string) => tag.toLowerCase())
    ));
  }

  private hasFilteredLabels(record: Record): boolean {
    if (!record.labels || typeof record.labels !== 'object') {
      return false;
    }


    const labels = record.labels as { values?: { val: string }[] };
    if (!labels.values) {
      return false;
    }

    return labels.values.some(label =>
        this.labelFilter.includes(label.val)
    );
  }

  private isWithinLast24Hours(createdAt: string): boolean {
    const created = new Date(createdAt);
    const now = new Date();
    const diffInHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
    return diffInHours <= 24;
  }

  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return

    const ops = await getOpsByType(evt)

    for (const post of ops.posts.creates) {
      if (
          this.hasFilteredLabels(post.record) ||
          !this.isWithinLast24Hours(post.record.createdAt)
      ) {
        continue;
      }

      const hashtags = this.extractHashtags(post.record.text);

      await Promise.all(
          hashtags.map(hashtag =>
              this.redisClient.trackHashtag(hashtag)
          )
      )
    }
  }
}