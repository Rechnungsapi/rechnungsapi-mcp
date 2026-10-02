import { readFileSync } from "node:fs"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { startMcpHttp, startUpstream } from "./helpers.js"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const pkg = JSON.parse(read("package.json")) as {
  description: string
  keywords: string[]
  homepage: string
  author: { name: string; email: string; url: string }
}

// "X-Invoice" / "xinvoice" is another vendor's product name. The gateway's own route and field names
// (createXinvoiceFromJson, xinvoiceXML, ...) are its API contract and stay in the source, but nothing a
// reader or an AI client is shown should use it.
const COMPETITOR_TERM = /x-?invoice/i
/** What a reader of the npm page can see: the README with link targets removed. */
const visibleText = (markdown: string) => markdown.replace(/\]\([^)]*\)/g, "]")

let upstream: Awaited<ReturnType<typeof startUpstream>>
let server: Awaited<ReturnType<typeof startMcpHttp>>
let client: Client

beforeAll(async () => {
  upstream = await startUpstream()
  server = await startMcpHttp({ RECHNUNGSAPI_BASE_URL: upstream.url, RECHNUNGSAPI_V2_BASE_URL: upstream.url })
  client = new Client({ name: "vitest", version: "1.0.0" })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${server.base}/mcp`), {
      requestInit: { headers: { Authorization: "Bearer tok-branding" } },
    }),
  )
})

afterAll(async () => {
  await client?.close()
  await server?.stop()
  await upstream?.close()
})

describe("the package presents itself as RechnungsAPI (rechnungsapi.de)", () => {
  it("says so in the npm description, homepage, author and keywords", () => {
    expect(pkg.description).toContain("RechnungsAPI")
    expect(pkg.description).toContain("rechnungsapi.de")
    expect(pkg.homepage).toMatch(/^https:\/\/rechnungsapi\.de(\/|$)/)
    expect(pkg.author).toMatchObject({ name: "RechnungsAPI", email: "support@rechnungsapi.de", url: "https://rechnungsapi.de" })
    expect(pkg.keywords).toEqual(expect.arrayContaining(["rechnungsapi", "rechnungsapi.de", "zugferd", "xrechnung", "mcp"]))
  })

  it("opens the README with what this is, where it is hosted and where it comes from", () => {
    const readme = read("README.md")
    const opening = readme.slice(0, 900)
    expect(opening).toContain("RechnungsAPI")
    expect(opening).toContain("rechnungsapi.de")
    expect(opening).toContain("https://mcp.rechnungsapi.de/mcp")
    expect(readme).toContain("https://rechnungsapi.de/api-docs")
    expect(readme).toContain("support@rechnungsapi.de")
  })

  it("labels the Docker image with the vendor and the website", () => {
    const dockerfile = read("Dockerfile")
    expect(dockerfile).toContain('org.opencontainers.image.vendor="RechnungsAPI"')
    expect(dockerfile).toContain('org.opencontainers.image.url="https://rechnungsapi.de"')
    expect(dockerfile).toContain("org.opencontainers.image.source=")
  })

  it("does not name a company or legal entity anywhere a reader can see", () => {
    // The package is presented as RechnungsAPI (rechnungsapi.de) only.
    const visible = [pkg.description, JSON.stringify(pkg.author), visibleText(read("README.md")), read("LICENSE"), read("Dockerfile")].join("\n")
    expect(visible).not.toMatch(/\bGmbH\b/)
  })

  it("keeps the other vendor's product name out of the description, keywords and README text", () => {
    expect([pkg.description, ...pkg.keywords].join("\n")).not.toMatch(COMPETITOR_TERM)
    expect(visibleText(read("README.md"))).not.toMatch(COMPETITOR_TERM)
  })
})

describe("the server introduces itself as RechnungsAPI to every MCP client", () => {
  it("sends the brand name, website and description in the initialize handshake", () => {
    expect(client.getServerVersion()).toMatchObject({
      name: "rechnungsapi-mcp",
      title: "RechnungsAPI",
      websiteUrl: "https://rechnungsapi.de",
    })
    expect(client.getServerVersion()?.description).toContain("rechnungsapi.de")
  })

  it("opens its instructions with the brand and the website", () => {
    expect(client.getInstructions()).toMatch(/^RechnungsAPI \(rechnungsapi\.de\)/)
  })

  it("shows no tool name, title, description or schema that uses the other vendor's product name", async () => {
    const { tools } = await client.listTools()
    expect(JSON.stringify(tools)).not.toMatch(COMPETITOR_TERM)
    expect(JSON.stringify(client.getInstructions())).not.toMatch(COMPETITOR_TERM)
    expect(JSON.stringify({ tools, instructions: client.getInstructions(), server: client.getServerVersion() })).not.toMatch(/\bGmbH\b/)
  })

  it("names the XRechnung tools after the standard", async () => {
    const names = (await client.listTools()).tools.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(["create_xrechnung", "validate_xrechnung_xml", "extract_xrechnung_from_zugferd"]))
  })
})

describe("opening the server's address tells you whose it is", () => {
  it("serves a small page to a browser, with the brand, the docs and a noindex", async () => {
    const r = await fetch(`${server.base}/`, { headers: { accept: "text/html,application/xhtml+xml" } })
    const html = await r.text()
    expect(r.status).toBe(200)
    expect(r.headers.get("content-type")).toContain("text/html")
    expect(r.headers.get("content-security-policy")).toContain("default-src 'none'")
    expect(html).toContain("RechnungsAPI")
    expect(html).toContain("https://rechnungsapi.de")
    expect(html).toContain("https://rechnungsapi.de/api-docs#mcp-sdk")
    expect(html).toContain('name="robots" content="noindex"')
    expect(html).not.toMatch(COMPETITOR_TERM)
    expect(html).not.toMatch(/\bGmbH\b/)
  })

  it("answers anything else with JSON that points at the docs", async () => {
    const r = await fetch(`${server.base}/`, { headers: { accept: "application/json" } })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({
      name: "RechnungsAPI",
      mcp: "/mcp",
      health: "/health",
      docs: "https://rechnungsapi.de/api-docs#mcp-sdk",
      website: "https://rechnungsapi.de",
    })
  })

  it("answers HEAD / too, and does not treat a POST to / as an MCP call", async () => {
    expect((await fetch(`${server.base}/`, { method: "HEAD" })).status).toBe(200)
    expect((await fetch(`${server.base}/`, { method: "POST", body: "{}" })).status).toBe(404)
  })

  it("points an unknown path at the docs as well", async () => {
    const r = await fetch(`${server.base}/nope`)
    expect(r.status).toBe(404)
    expect(await r.json()).toMatchObject({ docs: "https://rechnungsapi.de/api-docs#mcp-sdk" })
  })
})
