import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { RechnungsApiClient, RechnungsApiError } from "rechnungsapi-sdk"
import { z } from "zod"

const invoiceJsonSchema = z
  .record(z.string(), z.unknown())
  .describe(
    "Structured invoice data as a JSON object: header, seller, buyer, line items, VAT, totals and payment instructions " +
      "(EN 16931 business terms). Field reference: https://rechnungsapi.de/api-docs#invoice-object",
  )

const transportSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    "Optional email delivery: when set, the generated invoice is also sent by email in the same call. " +
      "Options: https://rechnungsapi.de/api-docs#email-transport",
  )

/** Wraps a client call so thrown RechnungsApiError/generic errors become MCP tool errors instead of crashing the server. */
async function asToolResult(fn: () => Promise<unknown>) {
  try {
    const result = await fn()
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] }
  } catch (error) {
    if (error instanceof RechnungsApiError) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ status: error.status, message: error.message, body: error.body }, null, 2),
          },
        ],
      }
    }
    const message = error instanceof Error ? error.message : String(error)
    return { isError: true, content: [{ type: "text" as const, text: message }] }
  }
}

export function registerTools(server: McpServer, client: RechnungsApiClient): void {
  server.registerTool(
    "create_zugferd_invoice",
    {
      title: "Create ZUGFeRD invoice",
      description:
        "Create a ZUGFeRD PDF/A-3 e-invoice (visual PDF with embedded XRechnung XML) from structured invoice JSON plus a visual PDF template.",
      inputSchema: {
        invoice: invoiceJsonSchema,
        invoicePdf64: z.string().describe("Base64-encoded visual PDF the XML will be embedded into"),
        transport: transportSchema,
      },
    },
    async ({ invoice, invoicePdf64, transport }) =>
      asToolResult(() => client.createZugferdFromJson(invoice, invoicePdf64, { transport })),
  )

  server.registerTool(
    "create_xinvoice",
    {
      title: "Create X-Invoice (XRechnung/UBL)",
      description: "Create an X-Invoice (XRechnung/UBL) XML document from structured invoice JSON.",
      inputSchema: {
        invoice: invoiceJsonSchema,
        transport: transportSchema,
      },
    },
    async ({ invoice, transport }) => asToolResult(() => client.createXInvoiceFromJson(invoice, { transport })),
  )

  server.registerTool(
    "create_zugferd_pdf",
    {
      title: "Embed X-Invoice XML into a PDF",
      description: "Embed an existing X-Invoice XML document into a visual PDF to produce a ZUGFeRD PDF.",
      inputSchema: {
        invoicePdf64: z.string().describe("Base64-encoded visual PDF"),
        xInvoiceXml: z.string().describe("X-Invoice XML to embed"),
      },
    },
    async ({ invoicePdf64, xInvoiceXml }) => asToolResult(() => client.createZugferdPdf(invoicePdf64, xInvoiceXml)),
  )

  server.registerTool(
    "extract_xinvoice_from_zugferd",
    {
      title: "Extract X-Invoice from ZUGFeRD PDF",
      description: "Extract the embedded XRechnung XML from a ZUGFeRD PDF and return it as structured JSON.",
      inputSchema: {
        zugferd64: z.string().describe("Base64-encoded ZUGFeRD PDF"),
      },
    },
    async ({ zugferd64 }) => asToolResult(() => client.extractXInvoiceFromZugferd(zugferd64)),
  )

  server.registerTool(
    "validate_xinvoice_xml",
    {
      title: "Validate X-Invoice XML",
      description: "Validate an X-Invoice (XRechnung/UBL) XML document against schema and business rules.",
      inputSchema: {
        xml: z.string().describe("The X-Invoice XML content to validate"),
      },
    },
    async ({ xml }) => asToolResult(() => client.validateXInvoiceXml(xml)),
  )

  server.registerTool(
    "validate_zugferd_pdf",
    {
      title: "Validate ZUGFeRD PDF",
      description: "Validate a ZUGFeRD PDF's embedded XML content.",
      inputSchema: {
        zugferdFile64: z.string().describe("Base64-encoded ZUGFeRD PDF"),
        comparePDF2XML: z.boolean().optional().describe("Also cross-check the embedded XML against the visual PDF content"),
      },
    },
    async ({ zugferdFile64, comparePDF2XML }) =>
      asToolResult(() => client.validateZugferdPdf(zugferdFile64, { comparePDF2XML })),
  )

  server.registerTool(
    "analyze_pdf_invoice",
    {
      title: "Analyze a PDF/scanned invoice",
      description:
        "Extract structured invoice JSON from a scanned or digital PDF/PNG/JPEG/TIFF invoice using the high-accuracy analyzer.",
      inputSchema: {
        pdfBase64: z.string().describe("Base64-encoded PDF, PNG, JPEG, or TIFF invoice"),
        withLineItems: z.boolean().optional().describe("Also extract individual line items"),
      },
    },
    async ({ pdfBase64, withLineItems }) =>
      asToolResult(() => client.analyzePdfInvoiceV2(pdfBase64, withLineItems ?? false)),
  )

  server.registerTool(
    "analyze_pdf_invoice_async_submit",
    {
      title: "Submit a large PDF invoice for async analysis",
      description:
        "Submit a large scanned/PDF invoice for asynchronous analysis (for files too large for the synchronous analyzer). " +
        "Returns a job_id — poll it with analyze_pdf_invoice_async_status.",
      inputSchema: {
        pdfBase64: z.string().describe("Base64-encoded PDF, PNG, JPEG, or TIFF invoice"),
        withLineItems: z.boolean().optional().describe("Also extract individual line items"),
      },
    },
    async ({ pdfBase64, withLineItems }) =>
      asToolResult(() => client.analyzePdfInvoiceAsync(pdfBase64, withLineItems)),
  )

  server.registerTool(
    "analyze_pdf_invoice_async_status",
    {
      title: "Check async PDF analysis status",
      description: "Poll the status of an asynchronous PDF invoice analysis job submitted via analyze_pdf_invoice_async_submit.",
      inputSchema: {
        jobId: z.string().describe("The job_id returned by analyze_pdf_invoice_async_submit"),
      },
    },
    async ({ jobId }) => asToolResult(() => client.getAnalysisStatus(jobId)),
  )

  server.registerTool(
    "create_zugferd_from_pdf",
    {
      title: "Convert a PDF/scan directly into a ZUGFeRD PDF",
      description:
        "Convert a PDF or scanned image invoice directly into a validated ZUGFeRD PDF/A-3 in one call " +
        "(analyzes, validates, and embeds in a single step).",
      inputSchema: {
        pdfBase64: z.string().describe("Base64-encoded PDF, PNG, JPEG, or TIFF invoice"),
        fileName: z.string().optional().describe("Original filename, used to name the resulting PDF"),
      },
    },
    async ({ pdfBase64, fileName }) => asToolResult(() => client.createZugferdFromPdf(pdfBase64, fileName)),
  )
}
