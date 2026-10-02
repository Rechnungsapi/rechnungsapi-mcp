import { readFileSync } from "node:fs"
import http from "node:http"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { startMcpHttp, startUpstream } from "./helpers.js"

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }
const MCP_HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" }
const toolsList = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
const EXPECTED_TOOLS = [
  "analyze_pdf_invoice",
  "analyze_pdf_invoice_async_status",
  "analyze_pdf_invoice_async_submit",
  "create_xinvoice",
  "create_zugferd_from_pdf",
  "create_zugferd_invoice",
  "create_zugferd_pdf",
  "extract_xinvoice_from_zugferd",
  "validate_xinvoice_xml",
  "validate_zugferd_pdf",
]

let upstream: Awaited<ReturnType<typeof startUpstream>>
let server: Awaited<ReturnType<typeof startMcpHttp>>

beforeAll(async () => {
  upstream = await startUpstream((req) =>
    req.body.includes("FORCE_401")
      ? { status: 401, body: { error: "Invalid token." } }
      : { status: 200, body: { isValid: true, message: "stub", xInvoiceErrors: [] } },
  )
  server = await startMcpHttp({ RECHNUNGSAPI_BASE_URL: upstream.url, MAX_BODY_MB: "2" })
})

afterAll(async () => {
  await server?.stop()
  await upstream?.close()
})

async function connect(token: string) {
  const client = new Client({ name: "vitest", version: "1.0.0" })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${server.base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  )
  return client
}

describe("housekeeping endpoints", () => {
  it("GET /health reports ok, name and the package.json version", async () => {
    const r = await fetch(`${server.base}/health`)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, name: "rechnungsapi-mcp", version: pkg.version })
  })

  it("HEAD /health answers 200", async () => {
    expect((await fetch(`${server.base}/health`, { method: "HEAD" })).status).toBe(200)
  })

  it("an unknown path is a 404", async () => {
    expect((await fetch(`${server.base}/nope`)).status).toBe(404)
  })
})

describe("protocol edge cases that once broke real clients", () => {
  it("OPTIONS /mcp (CORS preflight) -> 204 with permissive CORS headers", async () => {
    const r = await fetch(`${server.base}/mcp`, { method: "OPTIONS", headers: { origin: "https://claude.ai" } })
    expect(r.status).toBe(204)
    expect(r.headers.get("access-control-allow-origin")).toBe("*")
    expect(r.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("authorization")
  })

  it("GET /mcp answers 405 immediately instead of hanging", async () => {
    const t0 = Date.now()
    const r = await fetch(`${server.base}/mcp`, {
      headers: { authorization: "Bearer x", accept: "application/json, text/event-stream" },
      signal: AbortSignal.timeout(3000),
    })
    expect(r.status).toBe(405)
    expect(r.headers.get("allow")).toBe("POST, OPTIONS")
    expect(Date.now() - t0).toBeLessThan(1500)
  })

  it("DELETE /mcp is a 405 too", async () => {
    const r = await fetch(`${server.base}/mcp`, { method: "DELETE", headers: { authorization: "Bearer x" } })
    expect(r.status).toBe(405)
  })
})

describe("authentication", () => {
  it("POST without an Authorization header -> 401 with WWW-Authenticate", async () => {
    const r = await fetch(`${server.base}/mcp`, { method: "POST", headers: MCP_HEADERS, body: toolsList })
    expect(r.status).toBe(401)
    expect(r.headers.get("www-authenticate")).toMatch(/^Bearer/)
  })

  it("an empty Bearer value is still a 401", async () => {
    const r = await fetch(`${server.base}/mcp`, { method: "POST", headers: { ...MCP_HEADERS, authorization: "Bearer " }, body: toolsList })
    expect(r.status).toBe(401)
  })

  it.each([["Bearer some-token"], ["bearer some-token"], ["some-token"]])("Authorization: %s is accepted", async (authorization) => {
    const r = await fetch(`${server.base}/mcp`, { method: "POST", headers: { ...MCP_HEADERS, authorization }, body: toolsList })
    expect(r.status).toBe(200)
    expect((await r.text()).match(/"name":"/g)?.length).toBe(10)
  })
})

describe("request validation", () => {
  it("invalid JSON -> 400 with a JSON-RPC parse error, not a 500", async () => {
    const r = await fetch(`${server.base}/mcp`, { method: "POST", headers: { ...MCP_HEADERS, authorization: "Bearer x" }, body: "{not json" })
    expect(r.status).toBe(400)
    expect(await r.json()).toMatchObject({ jsonrpc: "2.0", error: { code: -32700 }, id: null })
  })

  it("a body over MAX_BODY_MB is refused up front (Content-Length)", async () => {
    const r = await fetch(`${server.base}/mcp`, {
      method: "POST",
      headers: { ...MCP_HEADERS, authorization: "Bearer x" },
      body: "x".repeat(3 * 1024 * 1024),
    })
    expect(r.status).toBe(413)
  })

  it("and also when the body is streamed without a Content-Length", async () => {
    const status = await new Promise<number>((resolve, reject) => {
      let answered = false
      const req = http.request(
        `${server.base}/mcp`,
        { method: "POST", headers: { authorization: "Bearer x", "content-type": "application/json", "transfer-encoding": "chunked" } },
        (res) => {
          answered = true
          res.resume()
          resolve(res.statusCode ?? 0)
        },
      )
      // The server may cut the upload short once it has answered; only a failure before any answer matters.
      req.on("error", (e) => {
        if (!answered) reject(e)
      })
      const chunk = Buffer.alloc(1024 * 1024, 120)
      req.write(chunk)
      req.write(chunk)
      req.write(chunk)
      req.end()
    })
    expect(status).toBe(413)
  })

  it("a body just under the limit still goes through", async () => {
    const pad = "x".repeat(1024 * 1024)
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { pad } })
    const r = await fetch(`${server.base}/mcp`, { method: "POST", headers: { ...MCP_HEADERS, authorization: "Bearer x" }, body })
    expect(r.status).toBe(200)
  })
})

describe("with the official MCP client", () => {
  it("connects, negotiates a protocol version and lists all ten tools", async () => {
    const client = await connect("tok-official")
    const info = client.getServerVersion()
    expect(info).toMatchObject({ name: "rechnungsapi-mcp", version: pkg.version })
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(EXPECTED_TOOLS)
    await client.close()
  })

  it("a tool call reaches the API with the caller's token and returns its result", async () => {
    const before = upstream.requests.length
    const client = await connect("tok-single")
    const res = await client.callTool({ name: "validate_xinvoice_xml", arguments: { xml: "<x/>" } })
    await client.close()
    expect(res.isError).toBeFalsy()
    expect(JSON.stringify(res.content)).toContain("isValid")
    const sent = upstream.requests.slice(before).filter((r) => r.url.endsWith("/api/v1/zugferd/validateXinvoiceXml"))
    expect(sent).toHaveLength(1)
    expect(sent[0].authorization).toBe("Bearer tok-single")
    expect(JSON.parse(sent[0].body)).toEqual({ xinvoiceXML: "<x/>" })
  })

  it("an API failure comes back as a tool error, not a crash", async () => {
    const client = await connect("tok-bad")
    const res = await client.callTool({ name: "validate_xinvoice_xml", arguments: { xml: "FORCE_401" } })
    await client.close()
    expect(res.isError).toBe(true)
    expect(JSON.stringify(res.content)).toContain("401")
    // and the server is still healthy afterwards
    expect((await fetch(`${server.base}/health`)).status).toBe(200)
  })

  it("keeps concurrent callers' tokens strictly separate", async () => {
    const before = upstream.requests.length
    const jobs: Promise<void>[] = []
    for (let i = 0; i < 5; i++) {
      for (const who of ["alice", "bob", "carol"]) {
        jobs.push(
          (async () => {
            const client = await connect(`tok-${who}`)
            await client.callTool({ name: "validate_xinvoice_xml", arguments: { xml: `<who>${who}-${i}</who>` } })
            await client.close()
          })(),
        )
      }
    }
    await Promise.all(jobs)
    const mine = upstream.requests.slice(before).filter((r) => r.url.endsWith("validateXinvoiceXml"))
    expect(mine).toHaveLength(15)
    for (const r of mine) {
      const who = /<who>(alice|bob|carol)-/.exec(r.body)?.[1]
      expect(who).toBeDefined()
      expect(r.authorization).toBe(`Bearer tok-${who}`)
    }
  })
})

describe("privacy", () => {
  it("logs method, path and status, but never tokens or tool arguments", async () => {
    const client = await connect("tok-SECRET-should-never-be-logged")
    await client.callTool({ name: "validate_xinvoice_xml", arguments: { xml: "<m>INVOICE-DATA-should-never-be-logged</m>" } })
    await client.close()
    const logs = server.logs()
    expect(logs).toContain("rpc=tools/call")
    expect(logs).toMatch(/\[http\] POST \/mcp -> 200/)
    expect(logs).not.toContain("tok-SECRET-should-never-be-logged")
    expect(logs).not.toContain("INVOICE-DATA-should-never-be-logged")
  })
})
