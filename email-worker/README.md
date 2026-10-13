# Email → draft post

A Cloudflare Email Worker that turns an email into a draft post.

- **Allowed senders:** `ken@chin-purcell.org`, `kencp@fastmail.com`. The envelope sender and the From: header must both match, and DKIM must pass for that domain. Anything else is bounced.
- **Subject** becomes the title and slug. Start it with `[travel]` or `[pottery]` to file the post in that folder and add that category.
- **Body** (plain text, signature after `-- ` removed) becomes the post body.
- **Photo attachments** (JPEG, PNG, GIF, WebP, HEIC) are saved to R2 full size, exactly as sent, as `<slug>-01.jpg`, `<slug>-02.jpg`, … (extension matches the type) and added to the end of the post in order. The site resizes them on request with Cloudflare Image Transformations, the same as photos synced with `sync-r2.sh`. The first one becomes the hero image.
- The post is committed with `category: [draft]`, so it appears only on `/drafts/`. Publish it in the CMS by removing `draft`.
- **Reply:** you get a "Draft created" reply in the same thread, with the file path, photo count and commit link. If something fails after your address is verified, the reply contains the error instead.

## One-time setup

1. **GitHub token:** create a fine-grained token with access to only `krumbunny/chin-purcell-site` and the permission *Contents: Read and write*.
2. **Deploy:**
   ```sh
   cd email-worker
   npm install
   npx wrangler login
   npx wrangler secret put GITHUB_TOKEN   # paste the token
   npx wrangler deploy
   ```
3. **Email Routing:** in the Cloudflare dashboard, open the domain → *Email* → *Email Routing*. Enable it, then add a custom address (something hard to guess, e.g. `post-7k2q@…`) with the action *Send to a Worker* → `email-to-draft`.
   ⚠️ Enabling Email Routing replaces the domain's MX records. If the domain already gets mail elsewhere, put the address on a subdomain instead.

## Debugging

`npx wrangler tail` shows live logs, including GitHub API errors, while you send a test email.
