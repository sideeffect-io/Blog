import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { postsByDate, postSlug } from '../lib/content';

export async function GET(context) {
  const posts = postsByDate(await getCollection('posts'));
  return rss({ title: 'Side Effect — Blog', description: 'Notes on software architecture and mobile development.', site: context.site, items: posts.map((post) => ({ title: post.data.title, description: post.data.description, pubDate: post.data.date, link: `/posts/${postSlug(post)}/` })) });
}
