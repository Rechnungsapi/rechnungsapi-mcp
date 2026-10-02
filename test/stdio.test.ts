import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { describe, expect, it } from "vitest"
import { ROOT, cleanEnv, startUpstream } from "./helpers.js"

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }

describe("stdio mode (what `npx rechnungsapi-mcp` runs)", () => {
  it("lists the tools and forwards the environment token to the API", async () => {
    const upstream = await startUpstream()
    const client = new Client({ name: "vitest", version: "1.0.0" })
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ["dist/index.js"],
        cwd: ROOT,
        env: { RECHNUNGSAPI_TOKEN: "stdio-token-1", RECHNUNGSAPI_BASE_URL: upstream.url },
      }),
    )
    try {
      expect(client.getServerVersion()).toMatchObject({ name: "rechnungsapi-mcp", version: pkg.version })
      expect((await client.listTools()).tools).toHaveLength(10)

      const res = await client.callTool({ name: "validate_xinvoice_xml", arguments: { xml: "<x/>" } })
      expect(res.isError).toBeFalsy()
      expect(upstream.requests.at(-1)?.authorization).toBe("Bearer stdio-token-1")
    } finally {
      await client.close()
      await upstream.close()
    }
  })

  it("refuses to start without RECHNUNGSAPI_TOKEN and says why", () => {
    const run = spawnSync(process.execPath, ["dist/index.js"], { cwd: ROOT, env: cleanEnv(), encoding: "utf8", timeout: 10_000 })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain("RECHNUNGSAPI_TOKEN")
  })
})
