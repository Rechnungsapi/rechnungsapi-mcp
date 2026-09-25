import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/http.ts"],
  format: ["esm"],
  target: "es2022",
  sourcemap: true,
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
})
