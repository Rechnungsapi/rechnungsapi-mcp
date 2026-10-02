import http from "node:http"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { RechnungsApiClient } from "rechnungsapi-sdk"
import { registerTools } from "./tools.js"
import { SERVER_NAME, SERVER_VERSION } from "./version.js"

const PORT = Number(process.env.PORT ?? 3939)

// Invoices travel as base64 PDFs, so the cap is generous. Without one, anyone able
// to send an Authorization header could make this process buffer an unbounded body
// in memory before the API ever gets the chance to reject their token.
const MAX_BODY_MB = Number(process.env.MAX_BODY_MB ?? 64)
const MAX_BODY_BYTES = (Number.isFinite(MAX_BODY_MB) && MAX_BODY_MB > 0 ? MAX_BODY_MB : 64) * 1024 * 1024

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly rpcCode?: number,
  ) {
    super(message)
  }
}

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers":
    "Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  "access-control-expose-headers": "Mcp-Session-Id, MCP-Protocol-Version",
  "access-control-max-age": "86400",
}

function extractBearerToken(req: http.IncomingMessage): string | null {
  const header = req.headers["authorization"]
  if (!header || Array.isArray(header)) return null
  const value = header.trim()
  // "Bearer" with nothing after it is a missing credential, not a token named "Bearer".
  if (!value || /^bearer$/i.test(value)) return null
  // Some connector UIs (Claude.ai's included) make the user type the scheme
  // themselves, so a bare token with no "Bearer " prefix is a common slip.
  // Accept it rather than failing the whole connection over it.
  const match = /^Bearer\s+(.+)$/i.exec(value)
  const token = (match ? match[1] : value).trim()
  return token || null
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const tooLarge = () => new HttpError(413, `Request body exceeds the ${MAX_BODY_BYTES / 1024 / 1024} MB limit`)
  const declared = Number(req.headers["content-length"])
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw tooLarge()

  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw tooLarge()
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString("utf8")
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    throw new HttpError(400, "Parse error: request body is not valid JSON", -32700)
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...extraHeaders })
  res.end(JSON.stringify(body))
}

/** JSON-RPC method names only — never params, which can carry invoice data. */
function describeRpc(body: unknown): string {
  const messages = Array.isArray(body) ? body : [body]
  const methods = messages
    .map((m) => (m && typeof m === "object" && "method" in m ? String((m as { method: unknown }).method) : null))
    .filter((m): m is string => m !== null)
  return methods.length ? methods.join(",") : "-"
}

/**
 * One request = one throwaway MCP server + SDK client, built from that
 * request's own Bearer token. Stateless mode (sessionIdGenerator: undefined)
 * is what makes this safe for many different customers hitting the same
 * running process concurrently — nothing is shared or cached between them.
 */
async function handleMcpRequest(req: http.IncomingMessage, res: http.ServerResponse, log: { rpc?: string }) {
  const token = extractBearerToken(req)
  if (!token) {
    sendJson(
      res,
      401,
      { error: "Missing Authorization: Bearer <your-rechnungsapi-token> header" },
      { "www-authenticate": `Bearer realm="${SERVER_NAME}"` },
    )
    return
  }

  const body = await readJsonBody(req)
  log.rpc = describeRpc(body)

  const client = new RechnungsApiClient({
    apiToken: token,
    baseUrl: process.env.RECHNUNGSAPI_BASE_URL,
    v2BaseUrl: process.env.RECHNUNGSAPI_V2_BASE_URL,
  })

  const mcpServer = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })
  registerTools(mcpServer, client)

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on("close", () => {
    transport.close()
    mcpServer.close()
  })

  await mcpServer.connect(transport)
  await transport.handleRequest(req, res, body)
}

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now()
  const log: { rpc?: string } = {}
  res.on("finish", () => {
    const ua = req.headers["user-agent"] ?? "-"
    const proto = req.headers["mcp-protocol-version"] ?? "-"
    const auth = req.headers["authorization"] ? "yes" : "no"
    console.log(
      `[http] ${req.method} ${req.url} -> ${res.statusCode} ${Date.now() - startedAt}ms auth=${auth} rpc=${log.rpc ?? "-"} proto=${proto} ua="${ua}"`,
    )
  })

  if (req.url === "/health" && (req.method === "GET" || req.method === "HEAD")) {
    sendJson(res, 200, { ok: true, name: SERVER_NAME, version: SERVER_VERSION })
    return
  }

  if (req.url !== "/mcp") {
    sendJson(res, 404, { error: "Not found. POST to /mcp." })
    return
  }

  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v)

  if (req.method === "OPTIONS") {
    res.writeHead(204)
    res.end()
    return
  }

  // This server is stateless (see handleMcpRequest) and never pushes
  // unsolicited server-to-client messages, so the optional GET/SSE stream
  // and DELETE/session-termination parts of the Streamable HTTP spec don't
  // apply here. Reject them fast and explicitly — StreamableHTTPServerTransport
  // has no defined behavior for them with sessionIdGenerator: undefined and
  // was observed to hang indefinitely rather than respond, which made MCP
  // clients' initial reachability probe (a bare GET) time out.
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Only POST is supported on /mcp (no server-initiated SSE stream)." }, { allow: "POST, OPTIONS" })
    return
  }

  try {
    await handleMcpRequest(req, res, log)
  } catch (error) {
    if (error instanceof HttpError) {
      if (!res.headersSent) {
        const body =
          error.rpcCode !== undefined
            ? { jsonrpc: "2.0", error: { code: error.rpcCode, message: error.message }, id: null }
            : { error: error.message }
        sendJson(res, error.status, body, error.status === 413 ? { connection: "close" } : {})
        // Stop reading an oversized upload once the answer is on its way.
        if (error.status === 413) res.once("finish", () => req.destroy())
      }
      return
    }
    console.error("Request failed:", error)
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Internal server error" })
    }
  }
})

server.listen(PORT, () => {
  console.log(`${SERVER_NAME} ${SERVER_VERSION} HTTP server listening on port ${PORT}`)
})
