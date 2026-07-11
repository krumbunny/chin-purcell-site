const { DateTime } = require("luxon");

module.exports = function (eleventyConfig) {
  // Static passthroughs
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/images");
  eleventyConfig.addPassthroughCopy("src/admin");

  // Human-friendly date filter, e.g. "April 25, 2025"
  eleventyConfig.addFilter("readableDate", (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat(
      "MMMM d, yyyy"
    );
  });

  // ISO date filter for <time datetime="">
  eleventyConfig.addFilter("isoDate", (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toISODate();
  });

  // Turns a Date into "2026/06/10" for WordPress-style permalinks
  eleventyConfig.addFilter("dateToPermalink", (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat(
      "yyyy/MM/dd"
    );
  });

  // {% year %} -> current year, for footer copyright
  eleventyConfig.addShortcode("year", () => `${new Date().getFullYear()}`);

  // All posts, newest first
  eleventyConfig.addCollection("posts", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/content/posts/*.md")
      .sort((a, b) => b.date - a.date);
  });

  // Posts filtered by category, newest first
  ["pottery", "travel", "cooking"].forEach((cat) => {
    eleventyConfig.addCollection(cat, (collectionApi) => {
      return collectionApi
        .getFilteredByGlob("src/content/posts/*.md")
        .filter((post) => post.data.category === cat)
        .sort((a, b) => b.date - a.date);
    });
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
