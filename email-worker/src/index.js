// Email → draft post.
//
// Cloudflare Email Routing hands each incoming message to this Worker. If it
// comes from an allowed sender, photo attachments are converted to JPEG
// (quality 70, long side ≤ 2048px) and saved to R2, and a markdown post with
// `category: [draft]` is committed to the site repo. The post then shows up
// on /drafts/ after the next build.
//
// Subject line becomes the title. An optional leading [travel] or [pottery]
// puts the post in that subfolder and adds that category, e.g.
//   "[travel] Crossing the border"

import PostalMime from "postal-mime";
import { EmailMessage } from "cloudflare:email";

const SECTIONS = ["travel", "pottery"];
const MAX_SIDE = 2048;
const JPEG_QUALITY = 70;

export default {
  async email(message, env, ctx) {
    const allowed = env.ALLOWED_SENDERS.split(",").map((s) => s.trim().toLowerCase());

    const envelopeFrom = message.from.toLowerCase();
    if (!allowed.includes(envelopeFrom)) {
      message.setReject(`Sender ${message.from} is not allowed to post`);
      return;
    }

    const email = await PostalMime.parse(message.raw);

    // The envelope sender is easy to forge, so also require the From: header
    // to match and DKIM to pass for the sender's domain.
    const headerFrom = (email.from?.address || "").toLowerCase();
    if (!allowed.includes(headerFrom)) {
      message.setReject(`From: ${headerFrom} is not allowed to post`);
      return;
    }
    if (!dkimPassed(message.headers, headerFrom.split("@")[1])) {
      message.setReject("DKIM check failed — not posting");
      return;
    }

    try {
      const draft = await createDraft(email, env);
      await sendReply(message, email, [
        `Draft created: ${draft.title}`,
        "",
        `File: ${draft.path}`,
        `Photos: ${draft.imageCount}`,
        "",
        `It will appear on ${env.SITE_URL}/drafts/ once the site rebuilds.`,
        `Edit it in the CMS: ${env.SITE_URL}/admin/`,
        draft.commitUrl ? `Commit: ${draft.commitUrl}` : "",
      ]);
    } catch (err) {
      console.error(err);
      await sendReply(message, email, [
        "Sorry, the draft could not be created.",
        "",
        String(err?.message || err),
      ]);
    }
  },
};

async function createDraft(email, env) {
  const { section, title } = parseSubject(email.subject);
  const date = localDate(email.date ? new Date(email.date) : new Date(), env.TIMEZONE);
  const folder = section ? `src/content/posts/${section}` : "src/content/posts";
  const slug = await uniqueSlug(env, folder, slugify(title) || `email-${date}`);

  const images = [];
  let n = 1;
  for (const att of email.attachments) {
    if (!att.mimeType?.startsWith("image/")) continue;
    const key = await uniqueImageKey(env, `${slug}-${String(n).padStart(2, "0")}`);
    await saveImage(env, att.content, key);
    images.push(`${env.PUBLIC_IMAGE_URL}/${key}`);
    n++;
  }

  const body = toMarkdown(email);
  const markdown = buildPost({ title, date, section, body, images });

  const path = `${folder}/${slug}.md`;
  const commitUrl = await commitFile(env, path, markdown, `Create draft “${slug}” (via email)`);
  return { title, path, imageCount: images.length, commitUrl };
}

// Reply in the same thread, from the routing address the email was sent to.
async function sendReply(message, email, lines) {
  const originalId = message.headers.get("message-id");
  const domain = message.to.split("@")[1];
  const subject = `Re: ${email.subject || "your post"}`;
  const headers = [
    `From: ${message.to}`,
    `To: ${message.from}`,
    `Subject: =?UTF-8?B?${base64(subject)}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    ...(originalId ? [`In-Reply-To: ${originalId}`, `References: ${originalId}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
  ];
  const text = lines.filter((l, i) => l || lines[i - 1]).join("\r\n");
  const raw = `${headers.join("\r\n")}\r\n\r\n${base64(text).replace(/.{76}/g, "$&\r\n")}\r\n`;
  try {
    await message.reply(new EmailMessage(message.to, message.from, raw));
  } catch (err) {
    console.error("Reply failed", err);
  }
}

function base64(str) {
  let binary = "";
  for (const b of new TextEncoder().encode(str)) binary += String.fromCharCode(b);
  return btoa(binary);
}

function parseSubject(subject) {
  const raw = (subject || "").trim();
  const m = raw.match(/^\[(\w+)\]\s*(.*)$/);
  if (m && SECTIONS.includes(m[1].toLowerCase())) {
    return { section: m[1].toLowerCase(), title: m[2].trim() || "Untitled" };
  }
  return { section: null, title: raw || "Untitled" };
}

// Look for "dkim=pass ... header.d=<domain>" in the Authentication-Results
// header Cloudflare adds to incoming mail.
function dkimPassed(headers, domain) {
  const results = [headers.get("authentication-results"), headers.get("arc-authentication-results")]
    .filter(Boolean)
    .join(";");
  const re = /dkim=pass[^;]*header\.d=([\w.-]+)/gi;
  for (const m of results.matchAll(re)) {
    const d = m[1].toLowerCase();
    if (d === domain || domain.endsWith(`.${d}`) || d.endsWith(`.${domain}`)) return true;
  }
  return false;
}

function localDate(date, timeZone) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function slugify(s) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toMarkdown(email) {
  let text = email.text;
  if (!text && email.html) {
    text = email.html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h\d|li)>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  text = (text || "").replace(/\r\n/g, "\n");
  // Drop a standard "-- " signature
  const sig = text.search(/^-- ?$/m);
  if (sig !== -1) text = text.slice(0, sig);
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildPost({ title, date, section, body, images }) {
  const categories = section ? [section, "draft"] : ["draft"];
  const lines = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `date: ${date}`,
    "category:",
    ...categories.map((c) => `  - ${c}`),
    "---",
    "",
  ];
  if (body) lines.push(body, "");
  for (const url of images) lines.push(`![](${url})`, "");
  return lines.join("\n");
}

async function saveImage(env, bytes, key) {
  const result = await env.IMAGES.input(new Blob([bytes]).stream())
    .transform({ width: MAX_SIDE, height: MAX_SIDE, fit: "scale-down" })
    .output({ format: "image/jpeg", quality: JPEG_QUALITY });
  const jpeg = await result.response().arrayBuffer();
  await env.BUCKET.put(key, jpeg, { httpMetadata: { contentType: "image/jpeg" } });
}

async function uniqueImageKey(env, base) {
  let key = `${base}.jpg`;
  for (let i = 2; await env.BUCKET.head(key); i++) key = `${base}-${i}.jpg`;
  return key;
}

async function uniqueSlug(env, folder, base) {
  let slug = base;
  for (let i = 2; await fileExists(env, `${folder}/${slug}.md`); i++) slug = `${base}-${i}`;
  return slug;
}

function github(env, path, init = {}) {
  return fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodeURI(path)}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "email-to-draft-worker",
      ...init.headers,
    },
  });
}

async function fileExists(env, path) {
  const res = await github(env, `${path}?ref=${env.GITHUB_BRANCH}`);
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`GitHub lookup failed: ${res.status} ${await res.text()}`);
  return true;
}

async function commitFile(env, path, content, commitMessage) {
  const res = await github(env, path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: commitMessage, content: base64(content), branch: env.GITHUB_BRANCH }),
  });
  if (!res.ok) throw new Error(`GitHub commit failed: ${res.status} ${await res.text()}`);
  return (await res.json()).commit?.html_url;
}
