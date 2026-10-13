const { DateTime } = require("luxon");
const tagCollections = require("./src/_data/tagCollections.js");

// Photos in R2 are full-size originals. Cloudflare Image Transformations
// resizes them on request (and caches the result): pages get a web-sized
// copy, the lightbox a larger one. Images hosted elsewhere pass through as-is.
const IMAGE_HOST = "https://images.kenchinpurcell.com";
const PAGE_QUALITY = 75;
const LIGHTBOX_WIDTH = 2400;
const LIGHTBOX_QUALITY = 85;

function imageUrl(src, width, quality = PAGE_QUALITY) {
  if (!src || !src.startsWith(`${IMAGE_HOST}/`)) return src;
  const options = `width=${width},quality=${quality},format=auto,fit=scale-down`;
  return `${IMAGE_HOST}/cdn-cgi/image/${options}/${src.slice(IMAGE_HOST.length + 1)}`;
}

function escapeAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// A post photo: a page-sized image (1x and 2x for the 820px content column)
// linking to a 2400px version that GLightbox opens. Optional caption is
// overlaid on the image and shown in the lightbox.
function photo(src, alt, caption) {
  const srcset = [820, 1640]
    .map((w) => `${escapeAttr(imageUrl(src, w))} ${w}w`)
    .join(", ");
  const img = `<img src="${escapeAttr(imageUrl(src, 820))}" srcset="${srcset}" sizes="(max-width: 860px) calc(100vw - 2.5rem), 820px" alt="${escapeAttr(alt)}" loading="lazy">`;
  const description = caption ? ` data-description="${escapeAttr(caption)}"` : "";
  const link = `<a class="glightbox" href="${escapeAttr(imageUrl(src, LIGHTBOX_WIDTH, LIGHTBOX_QUALITY))}" data-gallery="post"${description}>${img}</a>`;
  if (!caption) return link;
  return `<figure class="figure-overlay">
  ${link}
  <figcaption>${escapeAttr(caption)}</figcaption>
</figure>`;
}

module.exports = function (eleventyConfig) {
  // Static passthroughs
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/images");
  eleventyConfig.addPassthroughCopy("src/admin");
  eleventyConfig.addPassthroughCopy({ "node_modules/glightbox/dist": "vendor/glightbox" });

  // {{ heroImage | imageUrl(600) }} -> resized copy of an R2 photo
  eleventyConfig.addFilter("imageUrl", (src, width) => imageUrl(src, width));

  // Human-friendly date filter, e.g. "April 25, 2025"
  eleventyConfig.addFilter("readableDate", (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat(
      "MMMM d, yyyy",
    );
  });

  // ISO date filter for <time datetime="">
  eleventyConfig.addFilter("isoDate", (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toISODate();
  });

  // Turns a Date into "2026/06/10" for WordPress-style permalinks
  eleventyConfig.addFilter("dateToPermalink", (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat("yyyy/MM/dd");
  });

  // {% year %} -> current year, for footer copyright
  eleventyConfig.addShortcode("year", () => `${new Date().getFullYear()}`);

  // {% figure src, caption %} -> image with caption overlaid in white text at the bottom
  eleventyConfig.addShortcode("figure", (src, caption, alt) =>
    photo(src, alt || caption || "", caption),
  );

  // {% youtube "BZfyEG0sJK4", "Title" %} -> responsive YouTube embed. Takes a
  // video ID or any YouTube link; Shorts links get a vertical player.
  eleventyConfig.addShortcode("youtube", (idOrUrl, title) => {
    const input = String(idOrUrl).trim();
    const match = input.match(
      /(?:youtu\.be\/|[?&]v=|\/(?:embed|shorts|live)\/)([\w-]{11})/,
    );
    const id = match ? match[1] : input;
    const vertical = /\/shorts\//.test(input);
    const label = String(title || "YouTube video").replace(/"/g, "&quot;");
    return `<iframe class="video-embed${vertical ? " video-embed--vertical" : ""}" src="https://www.youtube-nocookie.com/embed/${id}" title="${label}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  });

  // Markdown images render as lightbox photos (see photo() above). A title
  // (`![alt](url "Caption")`) becomes a figure-overlay caption instead of a
  // native title tooltip, so authors can add an overlay caption without
  // reaching for the {% figure %} shortcode.
  eleventyConfig.amendLibrary("md", (mdLib) => {
    mdLib.renderer.rules.image = (tokens, idx) => {
      const token = tokens[idx];
      const title = token.attrGet("title") || "";
      return photo(token.attrGet("src"), token.content || title, title);
    };

    // A titled image is normally the sole inline child of its own paragraph;
    // suppress that paragraph's <p> tags so it doesn't wrap the <figure>
    // block our image rule renders above (same trick markdown-it uses to
    // drop <p> around tight list items).
    mdLib.core.ruler.push("figure_unwrap_paragraph", (state) => {
      const tokens = state.tokens;
      for (let i = 0; i < tokens.length - 2; i++) {
        const [open, inline, close] = tokens.slice(i, i + 3);
        if (
          open.type !== "paragraph_open" ||
          inline.type !== "inline" ||
          close.type !== "paragraph_close" ||
          inline.children.length !== 1 ||
          inline.children[0].type !== "image"
        ) {
          continue;
        }
        const titleIndex = inline.children[0].attrIndex("title");
        if (titleIndex >= 0 && inline.children[0].attrs[titleIndex][1]) {
          open.hidden = true;
          close.hidden = true;
        }
      }
    });
  });

  // A post is a draft if "draft" is among its categories. Draft posts are
  // excluded from every public-facing collection (home, archive, category
  // pages, tag pages) and only appear on the unlisted /drafts/ page.
  function isDraft(post) {
    const category = post.data.category;
    return Array.isArray(category)
      ? category.includes("draft")
      : category === "draft";
  }

  // Adjacent posts in chronological order (posts collection is sorted newest first)
  eleventyConfig.addFilter("previousPost", (posts, url) => {
    const index = posts.findIndex((post) => post.url === url);
    return index === -1 ? null : posts[index + 1] || null;
  });
  eleventyConfig.addFilter("nextPost", (posts, url) => {
    const index = posts.findIndex((post) => post.url === url);
    return index === -1 ? null : posts[index - 1] || null;
  });

  // All published posts, newest first
  eleventyConfig.addCollection("posts", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/content/posts/**/*.md")
      .filter((post) => !isDraft(post))
      .sort((a, b) => b.date - a.date);
  });

  // Draft posts, newest first — only shown on the unlisted /drafts/ page
  eleventyConfig.addCollection("drafts", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/content/posts/**/*.md")
      .filter((post) => isDraft(post))
      .sort((a, b) => b.date - a.date);
  });

  // Posts filtered by category, newest first
  ["pottery", "travel", "cooking", "journal"].forEach((cat) => {
    eleventyConfig.addCollection(cat, (collectionApi) => {
      return collectionApi
        .getFilteredByGlob("src/content/posts/**/*.md")
        .filter((post) => {
          if (isDraft(post)) return false;
          const category = post.data.category;
          return Array.isArray(category)
            ? category.includes(cat)
            : category === cat;
        })
        .sort((a, b) => b.date - a.date);
    });
  });

  // Category names with post counts and page links, for the archive page's
  // category list. "journal" is a valid category but has no dedicated page,
  // so it's omitted here.
  const categoryPages = [
    { category: "pottery", title: "Pottery", url: "/pottery/" },
    { category: "travel", title: "Travel", url: "/travel/" },
    { category: "cooking", title: "Cooking", url: "/cooking/" },
  ];

  eleventyConfig.addCollection("categoryCloud", (collectionApi) => {
    const posts = collectionApi
      .getFilteredByGlob("src/content/posts/**/*.md")
      .filter((post) => !isDraft(post));
    return categoryPages.map(({ category, title, url }) => ({
      title,
      url,
      count: posts.filter((post) => {
        const cats = post.data.category;
        return Array.isArray(cats) ? cats.includes(category) : cats === category;
      }).length,
    }));
  });

  // Unique tags with post counts, weighted 1-5 for cloud font sizing
  function buildTagCloud(collectionApi, { exclude } = {}) {
    const excludeSet = new Set(exclude || []);
    const counts = {};
    collectionApi
      .getFilteredByGlob("src/content/posts/**/*.md")
      .filter((post) => !isDraft(post))
      .forEach((post) => {
        (post.data.tags || []).forEach((tag) => {
          if (!tag || excludeSet.has(tag)) return;
          counts[tag] = (counts[tag] || 0) + 1;
        });
      });

    const entries = Object.entries(counts).map(([tag, count]) => ({
      tag,
      count,
    }));
    const maxCount = Math.max(...entries.map((e) => e.count), 1);
    const minCount = Math.min(...entries.map((e) => e.count), maxCount);
    const range = maxCount - minCount || 1;

    return entries
      .map((e) => ({
        ...e,
        weight: Math.round(((e.count - minCount) / range) * 4) + 1,
      }))
      .sort((a, b) => a.tag.localeCompare(b.tag));
  }

  eleventyConfig.addCollection("tagCloud", (collectionApi) =>
    buildTagCloud(collectionApi),
  );

  // Same as tagCloud, minus tags that have a curated page (see tagCollections.js),
  // so the generic tag template doesn't also try to generate those URLs.
  eleventyConfig.addCollection("tagCloudGeneric", (collectionApi) =>
    buildTagCloud(collectionApi, {
      exclude: tagCollections.map((t) => t.tag),
    }),
  );

  // Curated tag pages (see tagCollections.js): each entry's matching posts,
  // pre-sorted by its `sort` comparator (default: date ascending).
  eleventyConfig.addCollection("curatedTagPages", (collectionApi) => {
    const allPosts = collectionApi
      .getFilteredByGlob("src/content/posts/**/*.md")
      .filter((post) => !isDraft(post));
    return tagCollections.map((entry) => ({
      ...entry,
      posts: allPosts
        .filter((post) => (post.data.tags || []).includes(entry.tag))
        .sort(entry.sort || ((a, b) => a.date - b.date)),
    }));
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
