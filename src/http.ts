import http from "node:http"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { RechnungsApiClient } from "rechnungsapi-sdk"
import { registerTools } from "./tools.js"
import {
  SERVER_DESCRIPTION,
  SERVER_DOCS,
  SERVER_INFO,
  SERVER_INSTRUCTIONS,
  SERVER_NAME,
  SERVER_TITLE,
  SERVER_VERSION,
  SERVER_WEBSITE,
} from "./version.js"

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

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const tooLarge = () => new HttpError(413, `Request body exceeds the ${MAX_BODY_BYTES / 1024 / 1024} MB limit`)
  const declared = Number(req.headers["content-length"])
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return Promise.reject(tooLarge())

  // Event-based on purpose: breaking out of `for await (const c of req)` destroys the
  // request, and with it the socket, before the 413 can be delivered.
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let rejected = false
    req.on("data", (chunk: Buffer) => {
      if (rejected) return // keep consuming (and discarding) so the client can finish and read our answer
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        rejected = true
        chunks.length = 0
        reject(tooLarge())
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      if (rejected) return
      const raw = Buffer.concat(chunks).toString("utf8")
      if (!raw) return resolve(undefined)
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new HttpError(400, "Parse error: request body is not valid JSON", -32700))
      }
    })
    req.on("error", reject)
    // A promise settles once, so this is a no-op after a normal end.
    req.on("close", () => reject(new Error("connection closed before the request body was complete")))
  })
}

/**
 * The request path without query string or trailing slashes, so a URL typed as "/mcp/" or
 * "/mcp?x=1" reaches the same handler as "/mcp" instead of failing with a confusing 404.
 */
function routeOf(req: http.IncomingMessage): string {
  const path = (req.url ?? "/").split("?")[0]
  return path.replace(/\/+$/, "") || "/"
}

function sendJson(res: http.ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...extraHeaders })
  res.end(JSON.stringify(body))
}

// What a person sees when they open the server's address in a browser. Static text only, so there is
// nothing to escape, and noindex because the product pages on rechnungsapi.de are the ones to find.
const LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${SERVER_TITLE} MCP server</title>
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#1f2937}code{background:#f3f4f6;padding:.1rem .35rem;border-radius:.25rem}a{color:#2563eb}small{color:#6b7280}</style>
</head>
<body>
<h1>${SERVER_TITLE} MCP server</h1>
<p>This is the MCP endpoint of <a href="${SERVER_WEBSITE}">${SERVER_TITLE}</a> (rechnungsapi.de), the ZUGFeRD &amp; XRechnung API. It lets AI agents create, validate and analyze e-invoices.</p>
<p>MCP clients connect to <code>/mcp</code> on this host and send their own ${SERVER_TITLE} token as <code>Authorization: Bearer &lt;token&gt;</code>.</p>
<ul>
<li><a href="${SERVER_DOCS}">How to connect: documentation</a></li>
<li><a href="${SERVER_WEBSITE}/api-docs">API documentation</a></li>
<li><a href="${SERVER_WEBSITE}">rechnungsapi.de</a></li>
</ul>
<p><small>rechnungsapi-mcp ${SERVER_VERSION} · RechnungsAPI</small></p>
</body>
</html>
`

function sendLanding(req: http.IncomingMessage, res: http.ServerResponse) {
  const common = { "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" }
  if ((req.headers.accept ?? "").includes("text/html")) {
    res.writeHead(200, {
      ...common,
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    })
    res.end(LANDING_HTML)
    return
  }
  sendJson(
    res,
    200,
    { name: SERVER_TITLE, description: SERVER_DESCRIPTION, version: SERVER_VERSION, mcp: "/mcp", health: "/health", docs: SERVER_DOCS, website: SERVER_WEBSITE },
    common,
  )
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

  const mcpServer = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS })
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

  const route = routeOf(req)

  if (route === "/health" && (req.method === "GET" || req.method === "HEAD")) {
    sendJson(res, 200, { ok: true, name: SERVER_NAME, version: SERVER_VERSION })
    return
  }

  if (route === "/" && (req.method === "GET" || req.method === "HEAD")) {
    sendLanding(req, res)
    return
  }

  if (route !== "/mcp") {
    sendJson(res, 404, { error: "Not found. POST to /mcp.", docs: SERVER_DOCS })
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
        sendJson(res, error.status, body)
      }
      if (error.status === 413) {
        // The client may still be uploading. Keep discarding it so it can finish and read
        // this answer (closing early shows up client-side as EPIPE/ECONNRESET), but cap how
        // long that can go on so it can't be used to hold a connection open.
        const stop = setTimeout(() => req.destroy(), 10_000)
        stop.unref()
        req.once("close", () => clearTimeout(stop))
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
