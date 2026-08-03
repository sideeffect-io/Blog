# Publishing an article

Articles live in `src/content/posts/` as Markdown files.

## 1. Create the file

Use the date-first filename format:

```text
src/content/posts/YYYY-MM-DD-short-title.md
```

Start with frontmatter:

```yaml
---
title: A clear article title
date: 2026-08-03
description: One concise sentence used in previews and metadata.
tags: architecture, swift
image: images/YYYY-MM-DD-short-title/header.jpg
---
```

Put article images in `public/images/YYYY-MM-DD-short-title/`. The `image` value is the path used for the article header.

## 2. Write and preview

Run:

```bash
npm install
npm run dev
```

Open the local URL shown by Astro and check the article page, images, code blocks, links, and mobile layout.

## 3. Validate and publish

Run `npm run build`, then commit the Markdown and image files. Pushing to the connected branch creates a Netlify deploy preview; merging to the production branch publishes the article.
