import { parseArgs } from "node:util"

import * as esbuild from "esbuild"

/**
 * Bundles the main and preload entry points into `dist-electron/`.
 *
 * Bundling rather than plain `tsc` is what lets the preload script stay
 * sandboxed: a sandboxed preload cannot `require` a relative file, so the
 * shared API contract has to be inlined into it. `electron` and Node builtins
 * stay external — they are provided by the runtime.
 *
 *   node scripts/build-electron.mjs [--watch] [--minify]
 */
const { values } = parseArgs({
  options: {
    watch: { type: "boolean", default: false },
    minify: { type: "boolean", default: false },
  },
})

/** Everything the bundles agree on. @type {import("esbuild").BuildOptions} */
const shared = {
  outdir: "dist-electron",
  bundle: true,
  platform: "node",
  target: "node22",
  // Electron loads these as CommonJS; `__dirname` in main.ts depends on it.
  // The package is `"type": "module"`, so the extension — not the format — is
  // what Node believes: a `.js` file here would be loaded as ESM and fail on
  // the first `require`.
  format: "cjs",
  outExtension: { ".js": ".cjs" },
  // A native module has to stay a real file in node_modules (and a real
  // `dependency` in package.json); add it here beside `electron`.
  //
  // The Agent SDK is one in effect: it runs a platform-specific Claude Code
  // binary that it finds by resolving its sibling package, which only works
  // from a real node_modules — and it is ESM, loaded by `import()` from the
  // CJS bundle (`main/ai/claude.ts`).
  external: ["electron", "@anthropic-ai/claude-agent-sdk"],
  // A PNG imported by the main process travels inside the bundle as a data URL
  // rather than as a file read at runtime: `resources/` is not packaged —
  // `files` in package.json is `dist-electron` and `dist-renderer` — so a path
  // would resolve in dev and be missing from a built app.
  loader: { ".png": "dataurl" },
  sourcemap: true,
  minify: values.minify,
  logLevel: "info",
}

/**
 * Main. An ESM-only dependency that reaches for `import.meta.url` gets `{}`
 * under esbuild's CJS output, so the define below points it at a real file
 * URL instead.
 *
 * Its own build rather than a field on `shared` because the banner cannot go
 * near the preload: that script is sandboxed and has no `require` of node
 * builtins, so a `require("node:url")` at the top of it would fail before
 * anything else ran.
 *
 * @type {import("esbuild").BuildOptions}
 */
const main = {
  ...shared,
  entryPoints: { main: "src/main/main.ts" },
  banner: {
    js: `const __importMetaUrl = require("node:url").pathToFileURL(__filename).href;`,
  },
  define: { "import.meta.url": "__importMetaUrl" },
}

/** @type {import("esbuild").BuildOptions} */
const preload = {
  ...shared,
  entryPoints: { preload: "src/preload/index.ts" },
}

if (values.watch) {
  for (const options of [main, preload]) {
    const context = await esbuild.context(options)
    await context.watch()
  }
} else {
  await Promise.all([esbuild.build(main), esbuild.build(preload)])
}
