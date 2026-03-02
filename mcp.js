const { renderPage } = require('./renderer');
const { isValidUrl } = require('./utils/validator');

let SdkServer, SSEServerTransport, CallToolRequestSchema, ListToolsRequestSchema;
const transports = new Map();

async function initMcp() {
    const sdkServer = await import("@modelcontextprotocol/sdk/server/index.js");
    const sdkSse = await import("@modelcontextprotocol/sdk/server/sse.js");
    const sdkTypes = await import("@modelcontextprotocol/sdk/types.js");

    SdkServer = sdkServer.Server;
    SSEServerTransport = sdkSse.SSEServerTransport;
    CallToolRequestSchema = sdkTypes.CallToolRequestSchema;
    ListToolsRequestSchema = sdkTypes.ListToolsRequestSchema;
}

function createMcpServer() {
    const server = new SdkServer({
        name: "Rendu",
        version: "1.2.7"
    }, {
        capabilities: {
            tools: {}
        }
    });

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "fetch",
                    description: "Fetch a webpage and extract its content as Markdown, HTML, or plain text.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            url: {
                                type: "string",
                                description: "The URL of the webpage to render"
                            },
                            type: {
                                type: "string",
                                description: "The output type (markdown, html, or text). Defaults to markdown.",
                                enum: ["markdown", "html", "text"]
                            }
                        },
                        required: ["url"]
                    }
                }
            ]
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name === "fetch") {
            const url = request.params.arguments.url;
            const type = request.params.arguments.type || 'markdown';

            if (!url || !isValidUrl(url)) {
                return {
                    content: [{ type: "text", text: "Invalid or missing URL parameter." }],
                    isError: true,
                };
            }

            try {
                const result = await renderPage(url, type);
                if (result.error) {
                    return {
                        content: [{ type: "text", text: `Error: ${result.error}` }],
                        isError: true,
                    };
                }
                return {
                    content: [{ type: "text", text: `Title: ${result.title}\n\n${result.content}` }],
                    isError: false,
                };
            } catch (e) {
                return {
                    content: [{ type: "text", text: `Internal Error: ${e.message}` }],
                    isError: true,
                };
            }
        }
        throw new Error(`Tool not found: ${request.params.name}`);
    });

    return server;
}

function setupMcpRoutes(app) {
    // Init SDK imports async so we don't block Express startup
    let initPromise;
    try {
        initPromise = initMcp();
    } catch (e) {
        console.error("MCP Init triggered error directly:", e);
    }

    app.get("/mcp/sse", async (req, res) => {
        try {
            await initPromise;
        } catch (e) {
            return res.status(500).json({ error: "MCP SDK failed to load: " + e.message });
        }

        // Set mandatory CORS headers for SSE
        res.setHeader("Access-Control-Allow-Origin", "*");

        const transport = new SSEServerTransport("/mcp/messages", res);
        const mcpServer = createMcpServer();
        const sessionId = transport.sessionId;
        console.log(`[MCP] New SSE connection: ${sessionId}`);

        transports.set(sessionId, transport);
        res.on('close', () => {
            console.log(`[MCP] SSE connection closed: ${sessionId}`);
            transports.delete(sessionId);
        });

        await mcpServer.connect(transport);
    });

    app.options("/mcp/messages", (req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.sendStatus(200);
    });

    app.post("/mcp/messages", async (req, res) => {
        // Set CORS headers for the POST request as well
        res.setHeader("Access-Control-Allow-Origin", "*");

        try {
            await initPromise;
        } catch (e) {
            return res.status(500).json({ error: "MCP SDK failed to load" });
        }

        const sessionId = req.query.sessionId;
        const transport = typeof sessionId === "string" ? transports.get(sessionId) : undefined;
        if (!transport) {
            console.warn(`[MCP] Session not found or expired. Requested: ${String(sessionId)}`);
            return res.status(404).json({ error: "Session not found or expired" });
        }

        console.log(`[MCP] Received POST for session: ${sessionId}`);
        await transport.handlePostMessage(req, res);
    });
}

module.exports = { setupMcpRoutes };
