const { DateTime } = require("luxon");
const tagCollections = require("./src/_data/tagCollections.js");

module.exports = function (eleventyConfig) {
  // Static passthroughs
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/images");
  eleventyConfig.addPassthroughCopy("src/admin");

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

  // Adjacent posts in chronological order (posts collection is sorted newest first)
  eleventyConfig.addFilter("previousPost", (posts, url) => {
    const index = posts.findIndex((post) => post.url === url);
    return index === -1 ? null : posts[index + 1] || null;
  });
  eleventyConfig.addFilter("nextPost", (posts, url) => {
    const index = posts.findIndex((post) => post.url === url);
    return index === -1 ? null : posts[index - 1] || null;
  });

  // All posts, newest first
  eleventyConfig.addCollection("posts", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/content/posts/*.md")
      .sort((a, b) => b.date - a.date);
  });

  // Posts filtered by category, newest first
  ["pottery", "travel", "cooking", "misc"].forEach((cat) => {
    eleventyConfig.addCollection(cat, (collectionApi) => {
      return collectionApi
        .getFilteredByGlob("src/content/posts/*.md")
        .filter((post) => {
          const category = post.data.category;
          return Array.isArray(category)
            ? category.includes(cat)
            : category === cat;
        })
        .sort((a, b) => b.date - a.date);
    });
  });

  // Unique tags with post counts, weighted 1-5 for cloud font sizing
  function buildTagCloud(collectionApi, { exclude } = {}) {
    const excludeSet = new Set(exclude || []);
    const counts = {};
    collectionApi.getFilteredByGlob("src/content/posts/*.md").forEach((post) => {
      (post.data.tags || []).forEach((tag) => {
        if (!tag || excludeSet.has(tag)) return;
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });

    const entries = Object.entries(counts).map(([tag, count]) => ({ tag, count }));
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
    const allPosts = collectionApi.getFilteredByGlob("src/content/posts/*.md");
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
