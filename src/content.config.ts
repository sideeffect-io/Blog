import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const frontmatter = z.object({
  title: z.string(),
  date: z.coerce.date().optional(),
  description: z.string().optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  categories: z.union([z.string(), z.array(z.string())]).optional(),
  image: z.string().optional(),
  imageAlt: z.string().optional(),
  url: z.string().optional(),
  lang: z.enum(['en', 'fr']).default('en'),
});

export const collections = {
  posts: defineCollection({
    loader: glob({ pattern: '**/[^_]*.md', base: './src/content/posts' }),
    schema: frontmatter,
  }),
  pages: defineCollection({
    loader: glob({ pattern: '**/[^_]*.md', base: './src/content/pages' }),
    schema: frontmatter,
  }),
};
