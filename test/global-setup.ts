import { execSync } from "node:child_process"

// The tests drive the real built entrypoints (dist/http.js, dist/index.js),
// so make sure they reflect the current source before anything runs.
export default function setup() {
  execSync("yarn -s build", { stdio: "inherit" })
}
