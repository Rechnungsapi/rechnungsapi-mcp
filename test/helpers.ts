import { spawn } from "node:child_process"
import http from "node:http"
import net from "node:net"
import { fileURLToPath } from "node:url"

export const ROOT = fileURLToPath(new URL("..", import.meta.url))

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once("error", reject)
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo
      srv.close(() => resolve(port))
    })
  })
}

/** process.env minus anything that would change how the server under test behaves. */
export function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue
    if (k.startsWith("RECHNUNGSAPI_") || k === "PORT" || k === "MAX_BODY_MB") continue
    env[k] = v
  }
  return env
}

export type UpstreamRequest = { method: string; url: string; authorization?: string; body: string }
export type UpstreamReply = { status: number; body: unknown }

/** A stand-in for the RechnungsAPI gateway that records every request it receives. */
export async function startUpstream(respond?: (req: UpstreamRequest) => UpstreamReply) {
  const requests: UpstreamRequest[] = []
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      const rec: UpstreamRequest = {
        method: req.method ?? "",
        url: req.url ?? "",
        authorization: req.headers.authorization,
        body: Buffer.concat(chunks).toString("utf8"),
      }
      requests.push(rec)
      const reply = respond ? respond(rec) : { status: 200, body: { isValid: true, message: "stub", xInvoiceErrors: [] } }
      res.writeHead(reply.status, { "content-type": "application/json" })
      res.end(JSON.stringify(reply.body))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as net.AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

/** Starts dist/http.js on a free port and waits until /health answers. */
export async function startMcpHttp(env: Record<string, string>) {
  const port = await freePort()
  const child = spawn(process.execPath, ["dist/http.js"], {
    cwd: ROOT,
    env: { ...cleanEnv(), ...env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  child.stdout!.on("data", (d) => (output += d))
  child.stderr!.on("data", (d) => (output += d))

  const base = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 15_000
  for (;;) {
    try {
      if ((await fetch(`${base}/health`)).ok) break
    } catch {
      /* not up yet */
    }
    if (child.exitCode !== null) throw new Error(`server exited early:\n${output}`)
    if (Date.now() > deadline) throw new Error(`server did not start in time:\n${output}`)
    await new Promise((r) => setTimeout(r, 100))
  }
  return {
    base,
    logs: () => output,
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve()
        child.once("exit", () => resolve())
        child.kill()
      }),
  }
}
