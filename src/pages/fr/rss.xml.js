import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { postPath, postsByDate, postsForLocale } from '../../lib/content';

export async function GET(context) {
  const posts = postsByDate(postsForLocale(await getCollection('posts'), 'fr'));
  return rss({ title: 'Side Effect — Blog', description: 'Notes sur l’architecture logicielle et le développement mobile.', site: context.site, items: posts.map((post) => ({ title: post.data.title, description: post.data.description, pubDate: post.data.date, link: postPath(post, 'fr') })) });
}
