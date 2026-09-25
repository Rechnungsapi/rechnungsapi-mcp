import http from "node:http"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { RechnungsApiClient } from "rechnungsapi-sdk"
import { registerTools } from "./tools.js"

const PORT = Number(process.env.PORT ?? 3939)

function extractBearerToken(req: http.IncomingMessage): string | null {
  const header = req.headers["authorization"]
  if (!header || Array.isArray(header)) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1] : null
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString("utf8")
  return raw ? JSON.parse(raw) : undefined
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(body))
}

/**
 * One request = one throwaway MCP server + SDK client, built from that
 * request's own Bearer token. Stateless mode (sessionIdGenerator: undefined)
 * is what makes this safe for many different customers hitting the same
 * running process concurrently — nothing is shared or cached between them.
 */
async function handleMcpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const token = extractBearerToken(req)
  if (!token) {
    sendJson(res, 401, { error: "Missing Authorization: Bearer <your-rechnungsapi-token> header" })
    return
  }

  const client = new RechnungsApiClient({
    apiToken: token,
    baseUrl: process.env.RECHNUNGSAPI_BASE_URL,
    v2BaseUrl: process.env.RECHNUNGSAPI_V2_BASE_URL,
  })

  const mcpServer = new McpServer({ name: "rechnungsapi-mcp", version: "0.1.0" })
  registerTools(mcpServer, client)

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on("close", () => {
    transport.close()
    mcpServer.close()
  })

  await mcpServer.connect(transport)
  const body = req.method === "POST" ? await readJsonBody(req) : undefined
  await transport.handleRequest(req, res, body)
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.url !== "/mcp") {
    sendJson(res, 404, { error: "Not found. POST to /mcp." })
    return
  }

  try {
    await handleMcpRequest(req, res)
  } catch (error) {
    console.error("Request failed:", error)
    if (!res.headersSent) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }
})

server.listen(PORT, () => {
  console.log(`rechnungsapi-mcp HTTP server listening on port ${PORT}`)
})
