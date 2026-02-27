# Rendu - Webpage Renderer & MCP Server

A lightweight, Docker-ready HTTP API service for rendering JavaScript-heavy webpages and extracting clean content in **Markdown**, **HTML**, or **plain text**. 

Tech stack: Playwright, Mozilla's Readability, and Turndown.

Now includes **Swagger UI** for API documentation and a built-in **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)** server via SSE, allowing seamless integration with AI agents like Claude.

## Features

- 🕷️ **Renders SPA/JS-heavy pages** using headless Chromium (Playwright).
- 📄 **Smart Extraction** using Mozilla's Readability to remove clutter.
- 🔄 **Multiple Formats**: Export to Markdown (default), HTML, or plain text.
- ⚡ **Optimized Performance**: Singleton browser, concurrency control (max 5), disabled images/fonts/media to save memory.
- 📚 **Swagger API Docs**: Built-in interactive API documentation interface.
- 🤖 **MCP Server (SSE)**: Native integration for AI agents via Model Context Protocol.
- 🐳 **Docker-Ready**: Easy deployment with minimal configuration.

---

## Quick Start (Docker)

The easiest way to run Rendu is via Docker Compose:

```bash
# 1. Clone the repository
git clone https://github.com/xolyn/rendu.git
cd rendu

# 2. Build and start the container
docker compose up -d --build
```

The server will be available at: `http://localhost:8700` *(Default port is 8700, configurable via `.env`)*

---

## 1. REST API

### Render Endpoint
```http
GET /render?url=<URL>&type=<TYPE>
```

**Parameters**:
- `url` (required): The webpage URL to fetch.
- `type` (optional): Output format. Options: `markdown` (default), `html`, `text`.

**Example (cURL)**:
```bash
curl "http://localhost:8700/render?url=https://example.com&type=markdown"
```

**Response**:
```json
{
  "title": "Example Domain",
  "content": "# Example Domain\n\nThis domain is for use in illustrative examples in documents..."
}
```

### Swagger Interactive Docs
Navigate to your server's `/api-docs` path in your browser to view and test the API using the Swagger UI:
- **URL**: `http://localhost:8700/api-docs`

---

## 2. MCP Server (For AI Agents)

Rendu implements the official **Model Context Protocol (MCP)** using the Server-Sent Events (SSE) transport. This allows AI agents to directly connect to Rendu and use it as a tool to surf the web and read articles.

### Connection Info for AI Clients
- **Transport**: SSE (Server-Sent Events)
- **SSE Endpoint**: `http://localhost:8700/mcp/sse`

### Available Tools
When an AI agent connects via MCP, it gains access to the following tool:
- **Tool Name**: `fetch`
- **Description**: Fetch a webpage and extract its content as Markdown, HTML, or plain text.
- **Parameters**: 
  - `url` (string, required)
  - `type` (string, optional: `markdown`, `html`, `text`)

*(If you are configuring a custom AI assistant, simply point its MCP integration to the SSE Endpoint above!)*

---

## Local Development (Without Docker)

Requirements: Node.js 18+

```bash
# Install dependencies
npm install

# Install Playwright browser binaries
npx playwright install chromium

# Start the server
npm start
```
