const fs = require("fs");

// Grabs the first markdown image (`![alt](src "title")`) out of a post's
// body, so posts without a `heroImage` in frontmatter still get one for
// the post header, card thumbnails, and og:image.
function firstImage(inputPath) {
  const raw = fs.readFileSync(inputPath, "utf8");
  const frontmatterMatch = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  const body = frontmatterMatch ? raw.slice(frontmatterMatch[0].length) : raw;

  const imageMatch = body.match(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/);
  if (!imageMatch) return null;

  const [, alt, src, title] = imageMatch;
  return { src, alt: alt || title || "" };
}

module.exports = {
  layout: "post.njk",
  permalink: "/{{ date | dateToPermalink }}/{{ page.fileSlug }}/",
  eleventyComputed: {
    heroImage: (data) => data.heroImage || firstImage(data.page.inputPath)?.src,
    heroImageAlt: (data) =>
      data.heroImageAlt || firstImage(data.page.inputPath)?.alt,
  },
};
