# Security policy

## Reporting a vulnerability

Please report security problems privately by email to **support@rechnungsapi.de** with the subject "Security". Don't open a public issue, and don't include real invoices or API tokens in your report. We will acknowledge your report and keep you informed while we look into it.

## Supported versions

Only the latest published version of `rechnungsapi-mcp` receives security fixes. Update with `npm install -g rechnungsapi-mcp@latest`, or use `npx -y rechnungsapi-mcp@latest`.

## How tokens are handled

In the hosted and HTTP modes every request carries the caller's own RechnungsAPI token, and a fresh isolated client is built per request, so nothing is shared between callers. The server stores no invoices, and its log lines record only the HTTP method, path, status code, timing, whether an Authorization header was present, the client's user agent and the JSON-RPC method name, never tokens or tool arguments. If a token has been exposed, create a new one in your RechnungsAPI profile.
