export interface RechnungsApiMcpConfig {
  apiToken: string
  baseUrl?: string
  v2BaseUrl?: string
}

export function loadConfigFromEnv(): RechnungsApiMcpConfig {
  const apiToken = process.env.RECHNUNGSAPI_TOKEN
  if (!apiToken) {
    throw new Error(
      "RECHNUNGSAPI_TOKEN environment variable is required. Get your API token from the RechnungsAPI dashboard " +
        "and set it in your MCP client's server config (e.g. Claude Desktop/Code's mcp.json under \"env\").",
    )
  }
  return {
    apiToken,
    baseUrl: process.env.RECHNUNGSAPI_BASE_URL,
    v2BaseUrl: process.env.RECHNUNGSAPI_V2_BASE_URL,
  }
}
