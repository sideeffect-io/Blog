import type { CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

export function postsByDate(posts: Post[]) {
  return [...posts].sort((a, b) => {
    const left = a.data.date?.getTime() ?? 0;
    const right = b.data.date?.getTime() ?? 0;
    return right - left;
  });
}

export function tagsFor(post: Post) {
  const tags = post.data.tags ?? post.data.categories ?? [];
  return Array.isArray(tags)
    ? tags
    : tags.split(',').map((tag) => tag.trim()).filter(Boolean);
}

export function postSlug(post: Post) {
  return post.id.replace(/\.md$/, '').split('/').at(-1) ?? post.id;
}

export function imagePath(image?: string) {
  if (!image) return undefined;
  const normalized = image.replace(/^\/?i\//, 'images/').replace(/^\/?/, '/');
  return normalized.startsWith('/images/') ? normalized : `/images/${normalized}`;
}

export function formatDate(date?: Date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(date);
}
