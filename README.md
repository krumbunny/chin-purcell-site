# chin-purcell.org — Eleventy rebuild

A static rebuild of chin-purcell.org using [Eleventy](https://www.11ty.dev/), hosted on Cloudflare Pages,
with [Sveltia CMS](https://github.com/sveltia/sveltia-cms) as a browser-based editor for iPad use.

## What's here right now

This is a **starter version** with 3 sample posts (one per category) and placeholder photos, so you can
review the structure and design before we migrate your real content. Nothing here is final — the CSS
in particular (`src/css/style.css`) is a plain starting point for you to make your own.

```
src/
  _includes/       Nunjucks layouts (base.njk, post.njk, category.njk, post-card.njk)
  _data/site.json  Site title, nav links, description
  css/style.css    All styling — edit freely
  images/uploads/  Where post/page images live (this is what Sveltia CMS writes to)
  content/posts/   One Markdown file per post
  pottery/, travel/, cooking/   Category landing pages (index.md — hero + intro text + auto grid)
  posts/           Full chronological archive page
  contact/         Contact page
  admin/           Sveltia CMS (config.yml + index.html)
```

Each post is a Markdown file with front matter like this:

```yaml
---
layout: post.njk
title: "Kiln Firing #4"
date: 2026-06-01
category: pottery # pottery | travel | cooking
heroImage: /images/uploads/my-photo.jpg
heroImageAlt: "Pots freshly out of the kiln"
tags:
  - glaze chemistry
description: "One-line summary for link previews."
---
Body copy in **Markdown** goes here.
```

The `category` field is what drives the Pottery/Travel/Cooking pages — posts don't need to live in
different folders, they just get filtered by that field.

## Local development

```bash
npm install
npm start        # runs at http://localhost:8080, live-reloads on save
npm run build    # builds to _site/ (this is also what Cloudflare Pages runs)
```

You can do this from VS Code's integrated terminal, or Cursor — either works identically, since this
is just Node.js underneath. No framework-specific tooling required.

---

## Step-by-step: getting this live

### 1. Create the GitHub repo

1. On github.com, create a new **empty** repository (no README/license — we already have files).
   Suggested name: `chin-purcell-site`.
2. In this project folder, run:
   ```bash
   git init
   git add .
   git commit -m "Initial Eleventy rebuild"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/chin-purcell-site.git
   git push -u origin main
   ```

### 2. Connect Cloudflare Pages

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Pages → Connect to Git**, and pick
   the repo you just pushed.
2. Build settings:
   - **Framework preset:** Eleventy (or None — the settings below work either way)
   - **Build command:** `npx eleventy`
   - **Build output directory:** `_site`
3. Deploy. Cloudflare will give you a `*.pages.dev` URL immediately, and will rebuild and redeploy
   automatically on every future push to `main`.
4. Once you're happy, go to the project's **Custom domains** tab and add `chin-purcell.org`. Since the
   domain is already on Cloudflare (for NCCC's DNS, so presumably in the same account), this is usually
   just adding a CNAME — Cloudflare will prompt you for the exact record.
   - **Don't remove the WordPress DNS records until the new site is verified working on the custom
     domain** — we'll do a final cutover once everything's checked.

### 3. Set up Sveltia CMS (the iPad-friendly editor)

Sveltia authenticates to GitHub via OAuth, which requires a tiny relay — Sveltia's own Cloudflare Worker
handles this, so it's a few minutes of setup, not a real backend to maintain.

1. **Create a GitHub OAuth App:**
   - GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
   - Homepage URL: `https://chin-purcell.org`
   - Authorization callback URL: `https://YOUR-WORKER-SUBDOMAIN.workers.dev/callback` (you'll fill in
     the real subdomain after step 2 below — you can come back and edit this)
   - Save the **Client ID** and generate a **Client Secret**

2. **Deploy the Sveltia auth Worker:**
   - Go to [github.com/sveltia/sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth) and follow
     its deploy instructions (it's a "Deploy to Cloudflare Workers" button flow) — or fork it and connect
     it to Cloudflare Workers same as the Pages step above.
   - In the Worker's environment variables, set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` from step 1.
   - Note the Worker's `*.workers.dev` URL, and go back and fix the OAuth App's callback URL to match
     exactly (`https://<that-url>/callback`).

3. **Update `src/admin/config.yml`** in this repo:
   - `repo:` → `YOUR_USERNAME/chin-purcell-site`
   - `base_url:` → the Worker URL from step 2
   - Commit and push — Cloudflare Pages will redeploy with the updated config.

4. Visit `https://chin-purcell.org/admin/` on your iPad (or anywhere), click **Login with GitHub**,
   authorize, and you'll see the Sveltia editing UI — Posts and Fixed Pages collections, matching
   `config.yml`. Every save there is a commit to the `main` branch, which triggers a Cloudflare Pages
   rebuild automatically, same as pushing from your Mac.

### 4. Final DNS cutover

Once the custom domain is verified on Cloudflare Pages and you've checked the site over, update
chin-purcell.org's DNS to point at Cloudflare Pages instead of WordPress.com, and you can cancel/downgrade
the WordPress.com plan. I'd suggest leaving WordPress.com active (even on a free plan) for a week or two
after cutover just as a rollback option.

---

## Migrating your real content

Once you're happy with the design, next step is pulling in your actual posts and photos from
WordPress. That's a separate pass — happy to write a script that exports your WordPress content
(via its export tool or REST API) into these Markdown files automatically rather than copy-pasting
each post by hand.
