import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'

export const shortname = 'top-hashtags'

export const handler = async (ctx: AppContext, params: QueryParams) => {
  const currentIterationId = await ctx.cache.getCurrentIterationId();

  if (!currentIterationId) {
    return {
      feed: []
    };
  }

  const hashtagPosts = await ctx.cache.getHashtagPosts(currentIterationId);

  const feed = hashtagPosts.map(post => ({
    post: post.uri
  }));

  return {
    feed
  };
};