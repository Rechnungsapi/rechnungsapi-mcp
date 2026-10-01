import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

export const SERVER_NAME = "rechnungsapi-mcp"

export const SERVER_VERSION: string = (() => {
  try {
    return (require("../package.json") as { version: string }).version
  } catch {
    return "0.0.0"
  }
})()
