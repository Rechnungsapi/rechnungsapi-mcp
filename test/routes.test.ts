import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { startMcpHttp, startUpstream } from "./helpers.js"

// Every tool has to reach a route that is published at https://rechnungsapi.de/api-docs.
// A tool that calls a route the gateway doesn't have fails for every user, and a stub
// upstream can't notice that, so the expected routes below are copied from the docs
// rather than derived from the code under test.
const GATEWAY = "/api/v1/zugferd"

const CASES: Array<{ tool: string; args: Record<string, unknown>; method: string; route: string }> = [
  { tool: "create_zugferd_invoice", args: { invoice: { n: 1 }, invoicePdf64: "p64" }, method: "POST", route: `${GATEWAY}/createZugferdFromJson` },
  { tool: "create_xrechnung", args: { invoice: { n: 1 } }, method: "POST", route: `${GATEWAY}/createXinvoiceFromJson` },
  { tool: "create_zugferd_pdf", args: { invoicePdf64: "p64", xrechnungXml: "<x/>" }, method: "POST", route: `${GATEWAY}/createZugferdPdfFromXinvoice` },
  { tool: "extract_xrechnung_from_zugferd", args: { zugferd64: "z64" }, method: "POST", route: `${GATEWAY}/extractXinvoiceFromZugferdToJson` },
  { tool: "validate_xrechnung_xml", args: { xml: "<x/>" }, method: "POST", route: `${GATEWAY}/validateXinvoiceXml` },
  { tool: "validate_zugferd_pdf", args: { zugferdFile64: "z64" }, method: "POST", route: `${GATEWAY}/validateZugferdPdf` },
  { tool: "analyze_pdf_invoice", args: { pdfBase64: "p64" }, method: "POST", route: "/createJSONFromAnalysedPdf" },
  { tool: "analyze_pdf_invoice_async_submit", args: { pdfBase64: "p64" }, method: "POST", route: "/createJSONFromAnalysedPdfAsync" },
  { tool: "analyze_pdf_invoice_async_status", args: { jobId: "job-1" }, method: "GET", route: "/rechnungsapi-invoice-async-status?id=job-1" },
  { tool: "create_zugferd_from_pdf", args: { pdfBase64: "p64" }, method: "POST", route: "/createZugferdFromPdf" },
]

let upstream: Awaited<ReturnType<typeof startUpstream>>
let server: Awaited<ReturnType<typeof startMcpHttp>>

beforeAll(async () => {
  upstream = await startUpstream()
  // One stub plays both hosts: the gateway routes live under /api/v1/zugferd, the v2 ones at the root.
  server = await startMcpHttp({ RECHNUNGSAPI_BASE_URL: upstream.url, RECHNUNGSAPI_V2_BASE_URL: upstream.url })
})

afterAll(async () => {
  await server?.stop()
  await upstream?.close()
})

describe("each tool calls a route that exists in the published API docs", () => {
  it.each(CASES)("$tool -> $method $route", async ({ tool, args, method, route }) => {
    const before = upstream.requests.length
    const client = new Client({ name: "vitest", version: "1.0.0" })
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${server.base}/mcp`), {
        requestInit: { headers: { Authorization: "Bearer tok-routes" } },
      }),
    )
    await client.callTool({ name: tool, arguments: args })
    await client.close()

    const sent = upstream.requests.slice(before)
    expect(sent).toHaveLength(1)
    expect(`${sent[0].method} ${sent[0].url}`).toBe(`${method} ${route}`)
    expect(sent[0].authorization).toBe("Bearer tok-routes")
  })

  it("covers every tool the server registers", async () => {
    const client = new Client({ name: "vitest", version: "1.0.0" })
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${server.base}/mcp`), {
        requestInit: { headers: { Authorization: "Bearer tok-routes" } },
      }),
    )
    const { tools } = await client.listTools()
    await client.close()
    expect(tools.map((t) => t.name).sort()).toEqual(CASES.map((c) => c.tool).sort())
  })
})
