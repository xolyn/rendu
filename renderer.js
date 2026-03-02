const { Readability } = require('@mozilla/readability');
const TurndownService = require('turndown');
const { JSDOM } = require('jsdom');
const browserManager = require('./browser');

const turndownService = new TurndownService();
const NAVIGATION_TIMEOUT_MS = 30000;
const CLOUDFLARE_TIMEOUT_KEYWORDS = ['Timeout', 'timeout'];

function isTimeoutError(error) {
  if (!error || !error.message) {
    return false;
  }
  return CLOUDFLARE_TIMEOUT_KEYWORDS.some(keyword => error.message.includes(keyword));
}

function markdownToText(markdown) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function parseCloudflareSuccessResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await response.json();
    return { contentType, data };
  }

  if (contentType.includes('image/')) {
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    return { contentType, imageBase64: imageBuffer.toString('base64') };
  }

  return { contentType, text: await response.text() };
}

async function fetchCloudflareFallback(url, type) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error('Cloudflare fallback unavailable: missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  }

  const endpoint = type === 'screenshot' ? 'snapshot' : 'markdown';
  const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/${endpoint}`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cloudflare fallback HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  const parsed = await parseCloudflareSuccessResponse(response);

  if (type === 'screenshot') {
    if (parsed.imageBase64) {
      return { title: url, image: parsed.imageBase64, fallback: 1 };
    }

    if (parsed.data && parsed.data.result && typeof parsed.data.result.screenshot === 'string') {
      return { title: parsed.data.result.title || url, image: parsed.data.result.screenshot, fallback: 1 };
    }

    throw new Error('Cloudflare fallback returned unsupported screenshot response format');
  }

  let markdown = '';
  if (typeof parsed.text === 'string') {
    markdown = parsed.text.trim();
  } else if (parsed.data && typeof parsed.data.result === 'string') {
    markdown = parsed.data.result.trim();
  } else if (parsed.data && parsed.data.result && typeof parsed.data.result.markdown === 'string') {
    markdown = parsed.data.result.markdown.trim();
  } else if (parsed.data && typeof parsed.data.markdown === 'string') {
    markdown = parsed.data.markdown.trim();
  }

  if (!markdown) {
    throw new Error('Cloudflare fallback returned empty markdown content');
  }

  if (type === 'text') {
    return { title: url, content: markdownToText(markdown), fallback: 1 };
  }

  return { title: url, content: markdown, fallback: 1 };
}

/**
 * Renders a webpage and extracts content based on the type.
 * @param {string} url - The URL to render.
 * @param {string} type - The output type: 'markdown', 'html', 'text', or 'screenshot'.
 * @param {number|null} width - Viewport width for screenshot (optional).
 * @param {number|null} height - Viewport height for screenshot (optional).
 * @returns {Object} The extracted content or error.
 */
async function renderPage(url, type = 'markdown', width = null, height = null) {
  let page;
  try {
    page = await browserManager.getPage();

    // Set viewport if provided
    if (width && height) {
      await page.setViewportSize({ width, height });
    }

    // Navigate with timeout
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS
    });

    if (type === 'screenshot') {
      const title = await page.title();
      const image = await page.screenshot({ encoding: 'base64' });
      return { title, image, fallback: 0 };
    }

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
        content: article.content,
        fallback: 0
      };
    } else if (type === 'text') {
      // Remove HTML tags for text
      const textContent = article.content.replace(/<[^>]*>/g, '').trim();
      result = {
        title: article.title,
        content: textContent,
        fallback: 0
      };
    } else { // markdown
      const markdown = turndownService.turndown(article.content);
      result = {
        title: article.title,
        content: markdown,
        fallback: 0
      };
    }

    return result;
  } catch (error) {
    if (isTimeoutError(error) && ['markdown', 'text', 'screenshot'].includes(type)) {
      try {
        return await fetchCloudflareFallback(url, type);
      } catch (fallbackError) {
        return { error: `${error.message}. Fallback failed: ${fallbackError.message}`, fallback: 0 };
      }
    }
    return { error: error.message, fallback: 0 };
  } finally {
    if (page) {
      await browserManager.closePage(page);
    }
  }
}

module.exports = {
  renderPage
};
