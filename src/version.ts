import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

export const SERVER_NAME = "rechnungsapi-mcp"

/**
 * Sent to every client in the initialize response. MCP clients may pass it on to the model, so it
 * says what the server is for and where the full API documentation lives.
 */
export const SERVER_INSTRUCTIONS =
  "RechnungsAPI creates, validates and analyzes German e-invoices: ZUGFeRD (PDF/A-3) and X-Invoice (XRechnung/UBL XML). " +
  "PDFs and images are passed as base64 strings. For large scanned invoices, submit them with analyze_pdf_invoice_async_submit " +
  "and poll analyze_pdf_invoice_async_status. Invoice fields, endpoints and error codes are documented at https://rechnungsapi.de/api-docs"

export const SERVER_VERSION: string = (() => {
  try {
    return (require("../package.json") as { version: string }).version
  } catch {
    return "0.0.0"
  }
})()
