const { Readability } = require('@mozilla/readability');
const TurndownService = require('turndown');
const { JSDOM } = require('jsdom');
const browserManager = require('./browser');

const turndownService = new TurndownService();

/**
 * Renders a webpage and extracts content based on the type.
 * @param {string} url - The URL to render.
 * @param {string} type - The output type: 'markdown', 'html', or 'text'.
 * @returns {Object} The extracted content or error.
 */
async function renderPage(url, type = 'markdown') {
  let page;
  try {
    page = await browserManager.getPage();

    // Navigate with timeout
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Get page content
    const content = await page.content();

    // Limit page size (example: 5MB)
    if (content.length > 5 * 1024 * 1024) {
      throw new Error('Page content too large');
    }

    // Create DOM
    const dom = new JSDOM(content, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      throw new Error('Failed to extract content');
    }

    let result;

    if (type === 'html') {
      result = {
        title: article.title,
        content: article.content
      };
    } else if (type === 'text') {
      // Remove HTML tags for text
      const textContent = article.content.replace(/<[^>]*>/g, '').trim();
      result = {
        title: article.title,
        content: textContent
      };
    } else { // markdown
      const markdown = turndownService.turndown(article.content);
      result = {
        title: article.title,
        content: markdown
      };
    }

    return result;
  } catch (error) {
    return { error: error.message };
  } finally {
    if (page) {
      await browserManager.closePage(page);
    }
  }
}

module.exports = {
  renderPage
};
