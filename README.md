# rechnungsapi-mcp

MCP (Model Context Protocol) server for [RechnungsAPI](https://rechnungsapi.de) — lets Claude and other MCP-compatible AI agents create, validate, and analyze ZUGFeRD and X-Invoice e-invoices directly from a conversation.

Built on [`rechnungsapi-sdk`](https://github.com/Rechnungsapi/rechnungsapi-sdk).

## Setup

Get your API token from the [RechnungsAPI dashboard](https://rechnungsapi.de), then add the server to your MCP client's config.

**Claude Code** (`.mcp.json` in your project, or via `claude mcp add`):

```json
{
  "mcpServers": {
    "rechnungsapi": {
      "command": "npx",
      "args": ["-y", "rechnungsapi-mcp"],
      "env": {
        "RECHNUNGSAPI_TOKEN": "your-api-token"
      }
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`): same `mcpServers` entry as above.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `RECHNUNGSAPI_TOKEN` | Yes | Your RechnungsAPI Bearer token |
| `RECHNUNGSAPI_BASE_URL` | No | Override the gateway base URL (e.g. for a sandbox environment) |
| `RECHNUNGSAPI_V2_BASE_URL` | No | Override the v2 analyzer host |

## Tools

| Tool | Description |
|---|---|
| `create_zugferd_invoice` | Create a ZUGFeRD PDF/A-3 from structured invoice JSON + a visual PDF |
| `create_xinvoice` | Create an X-Invoice (XRechnung/UBL) XML from structured invoice JSON |
| `create_zugferd_pdf` | Embed an existing X-Invoice XML into a visual PDF |
| `extract_xinvoice_from_zugferd` | Extract the embedded XRechnung XML from a ZUGFeRD PDF as JSON |
| `validate_xinvoice_xml` | Validate an X-Invoice XML against schema and business rules |
| `validate_zugferd_pdf` | Validate a ZUGFeRD PDF's embedded XML |
| `analyze_pdf_invoice` | Extract structured invoice JSON from a scanned/PDF invoice |
| `analyze_pdf_invoice_async_submit` / `analyze_pdf_invoice_async_status` | Async analysis for large files |
| `create_zugferd_from_pdf` | Convert a PDF/scan directly into a validated ZUGFeRD PDF |

## Development

```bash
yarn install
yarn typecheck
yarn build
```

> Until [`rechnungsapi-sdk`](https://github.com/Rechnungsapi/rechnungsapi-sdk) is published to npm, `yarn install` will fail to resolve it. Build/link it locally first: in the sdk repo run `yarn build && yarn link`, then here run `yarn link rechnungsapi-sdk`.

Test locally with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
RECHNUNGSAPI_TOKEN=your-token yarn inspect
```

> **Note:** `@modelcontextprotocol/sdk` is pinned to `1.22.0` (not `^1.x`). Versions ≥1.23.0 introduced a Zod v3/v4 compatibility layer that currently triggers a `TS2589: Type instantiation is excessively deep` compiler error with `registerTool` (see [modelcontextprotocol/typescript-sdk#1180](https://github.com/modelcontextprotocol/typescript-sdk/issues/1180) and [#1423](https://github.com/modelcontextprotocol/typescript-sdk/issues/1423)). Re-evaluate this pin once that's fixed upstream.

## License

MIT
