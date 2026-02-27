require('dotenv').config();

const express = require('express');
const { renderPage } = require('./renderer');
const { isValidUrl } = require('./utils/validator');
const browserManager = require('./browser');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const { setupMcpRoutes } = require('./mcp');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON (though not needed for GET)
app.use(express.json());

// Swagger API Documentation route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Mount MCP Server routes
setupMcpRoutes(app);

// Route for rendering
app.get('/render', async (req, res) => {
  const { url, type = 'markdown' } = req.query;

  // Validate URL
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  if (!isValidUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Validate type
  if (!['markdown', 'html', 'text'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type parameter. Must be markdown, html, or text.' });
  }

  try {
    const result = await renderPage(url, type);

    if (result.error) {
      // Determine status code based on error
      let status = 500;
      if (result.error.includes('timeout') || result.error.includes('Navigation timeout')) {
        status = 504;
      }
      return res.status(status).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Start server
async function startServer() {
  try {
    await browserManager.launch();
    console.log('Browser launched successfully');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await browserManager.close();
  process.exit(0);
});

startServer();
