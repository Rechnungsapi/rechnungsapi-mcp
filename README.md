<p align="center">
  <a href="https://rechnungsapi.de"><img src="https://raw.githubusercontent.com/Rechnungsapi/rechnungsapi-mcp/main/assets/banner.svg" alt="RechnungsAPI MCP server: e-invoicing for AI agents" width="100%"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/rechnungsapi-mcp"><img src="https://img.shields.io/npm/v/rechnungsapi-mcp?color=2563eb&label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/rechnungsapi-mcp"><img src="https://img.shields.io/npm/dm/rechnungsapi-mcp?color=2563eb&label=downloads" alt="npm downloads per month"></a>
  <a href="https://github.com/Rechnungsapi/rechnungsapi-mcp/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Rechnungsapi/rechnungsapi-mcp/ci.yml?branch=main&label=tests" alt="tests"></a>
  <img src="https://img.shields.io/badge/MCP-server-7c3aed" alt="MCP server">
  <img src="https://img.shields.io/badge/node-%E2%89%A520-339933" alt="Node 20 or newer">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-16a34a" alt="MIT license"></a>
</p>

<h1 align="center">rechnungsapi-mcp</h1>

<p align="center">
  <b>Give your AI assistant e-invoicing superpowers.</b><br>
  The official MCP server for <a href="https://rechnungsapi.de">RechnungsAPI</a>: let AI agents create, validate and read ZUGFeRD and XRechnung invoices.
</p>

Germany's e-invoicing obligation (E-Rechnungspflicht) is being phased in, and structured invoices such as XRechnung and ZUGFeRD are becoming the standard. **RechnungsAPI** is the REST API that takes care of the hard parts. This server connects it to your AI assistant through the [Model Context Protocol](https://modelcontextprotocol.io), so the assistant can do the e-invoicing work for you, right inside the conversation.

**[Start free](https://rechnungsapi.de/register)** · [Documentation](https://rechnungsapi.de/api-docs#mcp-sdk) · [Pricing](https://rechnungsapi.de/pricing) · [SDK for developers](https://www.npmjs.com/package/rechnungsapi-sdk)

## Ask in plain language

| You say | What happens |
|---|---|
| "Validate this XRechnung and tell me what is wrong." | `validate_xrechnung_xml` checks it against the schema and the business rules, and the assistant explains the findings |
| "Create an XRechnung for this order: customer, three line items, 19% VAT." | `create_xrechnung` builds the XML from the invoice data the assistant puts together from your description |
| "Read this invoice PDF and give me the data as JSON." | `analyze_pdf_invoice` extracts structured data from the PDF, scan or photo |
| "Turn this PDF invoice into a ZUGFeRD e-invoice." | `create_zugferd_from_pdf` takes the PDF or scan in and returns a validated ZUGFeRD PDF, in one step |

Files travel as base64 text, which suits single invoices. For bulk or large-file workflows use the [SDK](https://www.npmjs.com/package/rechnungsapi-sdk) or the REST API directly.

## Connect in a minute

You need a RechnungsAPI token, and it is free to start: [create an account](https://rechnungsapi.de/register), open **Profile** and copy the token. See [Authentication](https://rechnungsapi.de/api-docs#authentication) for how it is sent.

**Hosted by RechnungsAPI, nothing to install.** Add this to your MCP client, for example as `.mcp.json` in your project for Claude Code:

```json
{
  "mcpServers": {
    "rechnungsapi": {
      "type": "http",
      "url": "https://mcp.rechnungsapi.de/mcp",
      "headers": { "Authorization": "Bearer your-api-token" }
    }
  }
}
```

**Or run it locally with `npx`** (needs Node.js 20 or newer). The same `mcpServers` entry works for Claude Code and for Claude Desktop (`claude_desktop_config.json`):

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

It works with Claude Code, Claude Desktop and Open WebUI, and with any MCP client that speaks Streamable HTTP with a custom header, or stdio.

## Why teams use it

- **Nothing to install.** Use the hosted server at `mcp.rechnungsapi.de`, or run the same server locally with one `npx` line.
- **Your token, your data.** Every request carries the caller's own token, so nothing is shared between customers. The server stores no invoices and logs only the method name of each call, never arguments or tokens.
- **Complete.** Ten tools cover creating, validating and reading e-invoices, including asynchronous analysis for big files.
- **Built for Germany and the EU.** RechnungsAPI is built for EN 16931, GoBD and GDPR, with data processed on German servers, and supports ZUGFeRD, XRechnung and Factur-X.
- **Open source and typed.** MIT licensed and built on the [`rechnungsapi-sdk`](https://www.npmjs.com/package/rechnungsapi-sdk).
- **Free to start.** Try it without a credit card.

## Tools

| Tool | Description |
|---|---|
| `create_zugferd_invoice` | Create a ZUGFeRD PDF/A-3 from structured invoice JSON + a visual PDF |
| `create_xrechnung` | Create an XRechnung XML from structured invoice JSON |
| `create_zugferd_pdf` | Embed an existing XRechnung XML into a visual PDF |
| `extract_xrechnung_from_zugferd` | Extract the embedded XRechnung XML from a ZUGFeRD PDF as JSON |
| `validate_xrechnung_xml` | Validate an XRechnung XML against schema and business rules |
| `validate_zugferd_pdf` | Validate a ZUGFeRD PDF's embedded XML |
| `analyze_pdf_invoice` | Extract structured invoice JSON from a scanned/PDF invoice |
| `analyze_pdf_invoice_async_submit` / `analyze_pdf_invoice_async_status` | Async analysis for large files |
| `create_zugferd_from_pdf` | Convert a PDF/scan directly into a validated ZUGFeRD PDF |

Each tool maps to one RechnungsAPI endpoint. The [API documentation](https://rechnungsapi.de/api-docs#endpoints) shows its request and response.

## Documentation

- **[API documentation](https://rechnungsapi.de/api-docs)**: every endpoint these tools call, with request, response and error codes (English and German)
- **[MCP server & SDK guide](https://rechnungsapi.de/api-docs#mcp-sdk)**: how to connect AI clients to RechnungsAPI's hosted MCP server
- [Authentication](https://rechnungsapi.de/api-docs#authentication): where your API token comes from and how it is sent
- [Invoice object reference](https://rechnungsapi.de/api-docs#invoice-object): the fields the `create_*` tools expect in `invoice` (EN 16931 business terms)
- [Errors](https://rechnungsapi.de/api-docs#errors): what the HTTP status codes and validation results mean

### Environment variables (local mode)

| Variable | Required | Description |
|---|---|---|
| `RECHNUNGSAPI_TOKEN` | Yes | Your RechnungsAPI Bearer token |
| `RECHNUNGSAPI_BASE_URL` | No | Override the gateway base URL (e.g. a staging or self-hosted gateway) |
| `RECHNUNGSAPI_V2_BASE_URL` | No | Override the v2 analyzer host |

## Self-hosting (Streamable HTTP)

By default this runs as a local `stdio` process, spawned per-user by their own AI client. That is what the `npx` setup above does, and it is the standard way MCP servers work. If instead you want to run **one shared, always-on server** that many users connect to remotely (no local install on their end at all, just a URL), use the HTTP mode.

The key architectural difference: `stdio` mode reads one fixed `RECHNUNGSAPI_TOKEN` from the environment at startup and reuses it for the whole process's life. HTTP mode instead reads **each request's own token** from its `Authorization: Bearer <token>` header, and builds a fresh, isolated client per request, so many different customers can safely share the same running server, each authenticated as themselves, never seeing each other's data.

### Run it

```bash
yarn build
yarn start:http   # listens on $PORT, default 3939
```

Or via Docker:

```bash
docker build -t rechnungsapi-mcp .
docker run -p 127.0.0.1:3939:3939 rechnungsapi-mcp
```

Or with Docker Compose: `docker compose up -d` builds the image from this repo's [`Dockerfile`](Dockerfile) (see [`docker-compose.yml`](docker-compose.yml)).

Or as a **Portainer stack**: paste [`deploy/portainer-stack.yml`](deploy/portainer-stack.yml) into Stacks → Add stack → Web editor and deploy. It needs no build, because the container installs the published package from npm when it starts. To upgrade, change the version in its `command` and redeploy. (Use this file rather than `docker-compose.yml` in the web editor: there is no build context there for `build: .` to use.)

No `RECHNUNGSAPI_TOKEN` is configured on the server itself in this mode, because each caller supplies their own.

### Server settings (HTTP mode)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3939` | Port to listen on |
| `MAX_BODY_MB` | `64` | Largest accepted request body. Invoices arrive as base64 PDFs, so this is generous; anything larger is answered with `413`. |
| `RECHNUNGSAPI_BASE_URL` | production gateway | Override the gateway base URL |
| `RECHNUNGSAPI_V2_BASE_URL` | production v2 host | Override the v2 analyzer host |

### Endpoints

| Endpoint | Description |
|---|---|
| `POST /mcp` | The MCP endpoint. Requires `Authorization: Bearer <caller's own RechnungsAPI token>`. |
| `GET /health` | Health check (used by Docker's `HEALTHCHECK` / Portainer / load balancers). No auth required. |
| `GET /` | A small page that says what the server is and links the documentation. |

### Putting it behind a domain

See [`deploy/nginx-mcp.conf`](deploy/nginx-mcp.conf) for a ready-to-use reverse proxy config (e.g. for `mcp.rechnungsapi.de`), including the settings needed so nginx doesn't buffer or break the SSE streaming responses. Pair it with `certbot --nginx -d mcp.rechnungsapi.de` for HTTPS, which is required in practice since real API tokens travel in every request. Also redirect plain HTTP to HTTPS (Nginx Proxy Manager: enable **Force SSL** on the proxy host), so a mistyped `http://` URL never sends a token unencrypted.

Two proxy settings matter for real invoices. First, the body limit: nginx refuses request bodies over 1 MB by default (`413`, before the request reaches this server), so the shipped config sets `client_max_body_size 64m` to match `MAX_BODY_MB`. In Nginx Proxy Manager, add the same line under the proxy host's **Advanced** tab if you ever see those `413`s. Second, the timeout: analysing a large scan can take a while, so the shipped config raises `proxy_read_timeout`; clients can also use the async tools for big files.

### Troubleshooting a client that "can't reach" the server

Every request is logged, so start with the container logs while the client tries to connect:

```bash
docker logs -f rechnungsapi-mcp
# [http] POST /mcp -> 200 12ms auth=yes rpc=initialize proto=- ua="..."
```

| What you see | What it means |
|---|---|
| Nothing at all | The request never arrived. Check DNS, the reverse proxy and firewalls. `curl https://your-host/health` from outside should return `{"ok":true,...}`. |
| `401 ... auth=no` | The client isn't sending an `Authorization` header. The connector's auth mode is probably set to OAuth/none instead of a Bearer/API-key header. |
| `401 ... auth=yes` | The header arrived but the token is empty or wrong. Copy it again from your profile (see [Authentication](https://rechnungsapi.de/api-docs#authentication)). The `Bearer ` prefix is optional, a bare token is accepted. |
| `GET /mcp -> 405` | Expected. This server doesn't offer the optional server-push SSE stream; compliant clients continue over `POST`. |
| `OPTIONS /mcp -> 204` | Expected: a browser-based client's CORS preflight. |
| `POST /mcp -> 413` | The request body exceeded `MAX_BODY_MB`. |
| The client gets `413 Request Entity Too Large` (an HTML page) but the log shows nothing | The reverse proxy refused the body before it reached this server. nginx's default limit is 1 MB, so set `client_max_body_size 64m;` (see [`deploy/nginx-mcp.conf`](deploy/nginx-mcp.conf)). |
| `POST /mcp -> 400` | The body wasn't valid JSON (JSON-RPC parse error `-32700`). |

Log lines record JSON-RPC method names only (e.g. `rpc=tools/call`), never arguments, so invoice data and tokens don't end up in your logs.

## Start free

RechnungsAPI is free to start, with no credit card required. [Create your account](https://rechnungsapi.de/register), copy your token and connect your assistant in minutes. Questions about plans, integration or your project? [Talk to us](https://rechnungsapi.de/contact) or write to support@rechnungsapi.de.

## Development

```bash
yarn install
yarn typecheck
yarn test    # builds first, then runs the stdio and HTTP suites against a stub API
yarn build
```

Test locally with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
RECHNUNGSAPI_TOKEN=your-token yarn inspect
```

> **Note:** `@modelcontextprotocol/sdk` is pinned to an exact version rather than `^1.x`. This server is reachable from the internet, so the library only changes after the test suite has run against the new version. Releases before 1.26.0 have published security advisories (they show up in `npm audit`), so don't go back to an older one.

Found a security problem? Please read [SECURITY.md](SECURITY.md).

## License

MIT © RechnungsAPI · [rechnungsapi.de](https://rechnungsapi.de) · support@rechnungsapi.de
