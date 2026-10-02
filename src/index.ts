import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { RechnungsApiClient } from "rechnungsapi-sdk"
import { loadConfigFromEnv } from "./config.js"
import { registerTools } from "./tools.js"
import { SERVER_INSTRUCTIONS, SERVER_NAME, SERVER_VERSION } from "./version.js"

async function main() {
  const config = loadConfigFromEnv()
  const client = new RechnungsApiClient(config)

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: SERVER_INSTRUCTIONS })
  registerTools(server, client)

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((error) => {
  console.error("rechnungsapi-mcp failed to start:", error instanceof Error ? error.message : error)
  process.exit(1)
})
