# Publishing with Netlify

The site is a static Astro build and can be deployed directly from the Git repository.

## Site settings

In Netlify, create or update the site using the repository containing this project:

- Build command: `npm run build`
- Publish directory: `dist`
- Node version: 20 or newer

Netlify detects `package.json` and installs dependencies before running the build. No server or database is required.

## Deploy workflow

1. Push a branch to the repository.
2. Review the generated deploy preview, including article URLs, downloads, support pages, and RSS.
3. Merge the change into the production branch.
4. Confirm the production deploy and custom domain resolve over HTTPS.

The canonical site URL is configured as `https://sideeffect.io` in `astro.config.mjs`; update it there if the domain changes.

## Troubleshooting

- If the build fails, run `npm ci && npm run build` locally.
- If a legacy file is missing, confirm it exists under `public/`; files there are copied to the generated site unchanged.
- If an article image is missing, check that the frontmatter path starts with `images/` and that the file exists under `public/images/`.
- If a URL changes, add an explicit Netlify redirect before publishing and verify the old URL.
