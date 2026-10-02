import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

export const SERVER_NAME = "rechnungsapi-mcp"
export const SERVER_TITLE = "RechnungsAPI"
export const SERVER_WEBSITE = "https://rechnungsapi.de"
export const SERVER_DOCS = "https://rechnungsapi.de/api-docs#mcp-sdk"
export const SERVER_DESCRIPTION =
  "RechnungsAPI (rechnungsapi.de), the ZUGFeRD & XRechnung API: create, validate and analyze e-invoices."

/**
 * Sent to every client in the initialize response. MCP clients may pass it on to the model, so it
 * says what the server is for and where the full API documentation lives.
 */
export const SERVER_INSTRUCTIONS =
  "RechnungsAPI (rechnungsapi.de) creates, validates and analyzes German e-invoices: ZUGFeRD (PDF/A-3) and XRechnung (XML). " +
  "PDFs and images are passed as base64 strings. For large scanned invoices, submit them with analyze_pdf_invoice_async_submit " +
  "and poll analyze_pdf_invoice_async_status. Invoice fields, endpoints and error codes are documented at https://rechnungsapi.de/api-docs"

export const SERVER_VERSION: string = (() => {
  try {
    return (require("../package.json") as { version: string }).version
  } catch {
    return "0.0.0"
  }
})()

/** Who this server says it is in the MCP initialize handshake, so clients can show the brand. */
export const SERVER_INFO = {
  name: SERVER_NAME,
  title: SERVER_TITLE,
  version: SERVER_VERSION,
  websiteUrl: SERVER_WEBSITE,
  description: SERVER_DESCRIPTION,
}
