import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { startMcpHttp, startUpstream } from "./helpers.js"

let upstream: Awaited<ReturnType<typeof startUpstream>>
let server: Awaited<ReturnType<typeof startMcpHttp>>
let client: Client

beforeAll(async () => {
  upstream = await startUpstream()
  server = await startMcpHttp({ RECHNUNGSAPI_BASE_URL: upstream.url, RECHNUNGSAPI_V2_BASE_URL: upstream.url })
  client = new Client({ name: "vitest", version: "1.0.0" })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${server.base}/mcp`), {
      requestInit: { headers: { Authorization: "Bearer tok-tools" } },
    }),
  )
})

afterAll(async () => {
  await client?.close()
  await server?.stop()
  await upstream?.close()
})

describe("what an AI client is told about the server", () => {
  it("sends instructions that say what the server does and link the API documentation", () => {
    const text = client.getInstructions() ?? ""
    expect(text).toContain("e-invoices")
    expect(text).toContain("https://rechnungsapi.de/api-docs")
    expect(text).toContain("analyze_pdf_invoice_async_submit")
  })

  it("gives every tool a description and an object input schema", async () => {
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(10)
    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy()
      expect(tool.inputSchema.type, tool.name).toBe("object")
    }
  })

  it.each(["create_zugferd_invoice", "create_xinvoice"])("%s: `invoice` is a required object that points at the field reference", async (name) => {
    const { tools } = await client.listTools()
    const schema = tools.find((t) => t.name === name)!.inputSchema as {
      properties: Record<string, { type?: string; description?: string }>
      required?: string[]
    }
    expect(schema.required).toContain("invoice")
    expect(schema.properties.invoice.type).toBe("object")
    expect(schema.properties.invoice.description).toContain("https://rechnungsapi.de/api-docs#invoice-object")
  })

  it.each(["create_zugferd_invoice", "create_xinvoice"])("%s: `transport` is an optional object that points at the email docs", async (name) => {
    const { tools } = await client.listTools()
    const schema = tools.find((t) => t.name === name)!.inputSchema as {
      properties: Record<string, { type?: string; description?: string }>
      required?: string[]
    }
    expect(schema.required ?? []).not.toContain("transport")
    expect(schema.properties.transport.type).toBe("object")
    expect(schema.properties.transport.description).toContain("https://rechnungsapi.de/api-docs#email-transport")
  })
})

describe("the invoice travels to the API exactly as given", () => {
  const invoice = {
    invoiceNumber: "RE-2026-001",
    issueDate: "2026-10-02",
    currency: "EUR",
    seller: { name: "Müller & Söhne GmbH", address: { street: "Hauptstraße 1", zip: "10115", city: "Berlin" }, vatId: "DE123456789" },
    lines: [
      { position: 1, description: "Beratung \"Premium\" — 3,5 h", quantity: 3.5, unitPrice: 119.99, vatRate: 19, discount: null, taxExempt: false },
      { position: 2, description: "Reisekosten", quantity: 1, unitPrice: 0.1 + 0.2, vatRate: 7, tags: ["a", "b", []] },
    ],
    note: "x".repeat(50_000),
    empty: {},
  }

  it("keeps nested objects, arrays, numbers, booleans, null and unicode intact", async () => {
    const before = upstream.requests.length
    const res = await client.callTool({ name: "create_xinvoice", arguments: { invoice, transport: { method: "email", to: ["a@example.com"] } } })
    expect(res.isError).toBeFalsy()
    const sent = upstream.requests.slice(before)
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe("/api/v1/zugferd/createXinvoiceFromJson")
    expect(JSON.parse(sent[0].body)).toEqual({ invoice, transport: { method: "email", to: ["a@example.com"] } })
  })

  it("omits `transport` entirely when it isn't given", async () => {
    const before = upstream.requests.length
    await client.callTool({ name: "create_xinvoice", arguments: { invoice: { n: 1 } } })
    expect(JSON.parse(upstream.requests[before].body)).toEqual({ invoice: { n: 1 } })
  })

  it.each([
    ["a string", "not an object"],
    ["an array", [1, 2]],
    ["a number", 7],
    ["null", null],
  ])("rejects %s as the invoice without calling the API", async (_label, bad) => {
    const before = upstream.requests.length
    const outcome = await client.callTool({ name: "create_xinvoice", arguments: { invoice: bad } }).then(
      (r) => r.isError === true,
      () => true, // a JSON-RPC "invalid params" error is just as good
    )
    expect(outcome).toBe(true)
    expect(upstream.requests.length).toBe(before)
  })

  it("rejects a call with no invoice at all without calling the API", async () => {
    const before = upstream.requests.length
    const outcome = await client.callTool({ name: "create_zugferd_invoice", arguments: { invoicePdf64: "x" } }).then(
      (r) => r.isError === true,
      () => true,
    )
    expect(outcome).toBe(true)
    expect(upstream.requests.length).toBe(before)
  })
})
