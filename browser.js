const { chromium } = require('playwright');
const path = require('path');

/**
 * Browser manager class for singleton browser instance with concurrency control.
 */
class BrowserManager {
  constructor(maxConcurrency = 5) {
    this.maxConcurrency = maxConcurrency;
    this.activePages = 0;
    this.waitQueue = [];
    this.browser = null;
  }

  /**
   * Launch the browser if not already launched.
   */
  async launch() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
        args: [
          '--disable-images=true',
          '--disable-fonts=true',
          '--disable-media=true',
          '--disable-plugins=true',
          '--disable-extensions=true',
          '--disable-dev-shm-usage=true',
          '--no-sandbox=true'
        ]
      });
    }
  }

  /**
   * Get a new page with concurrency control.
   * @returns {Promise<Page>} A new page instance.
   */
  async getPage() {
    if (this.activePages >= this.maxConcurrency) {
      await new Promise(resolve => {
        this.waitQueue.push(resolve);
      });
    }
    this.activePages++;
    return await this.browser.newPage();
  }

  /**
   * Close a page and release the concurrency slot.
   * @param {Page} page - The page to close.
   */
  async closePage(page) {
    await page.close();
    this.activePages--;
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift();
      resolve();
    }
  }

  /**
   * Close the browser.
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// Singleton instance
const browserManager = new BrowserManager();

module.exports = browserManager;
