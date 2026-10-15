# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

This file is the **operating manual**: the commands, the contracts, and the
handful of constraints that cost a debugging session if you do not know them.
Keep it short — every turn pays for it. **`docs/design.md` is the design
document**: what each feature does and why, and every feature that was
removed. Read the relevant section there before changing an area's behaviour.

## What this is

**FinLens**: a desktop market-analysis app for retail investors in crypto,
Vietnamese stocks and US stocks — live quotes, candlestick charts with
indicators, a heatmap, a portfolio with P&L, and an AI analyst (Claude, through
the Agent SDK) that reads all of it through its own tools. Electron — React 19

- Vite + Tailwind v4 + shadcn/ui in the renderer, a bundled TypeScript main
  process, one sandboxed preload bridging them. The UI is in Vietnamese.

One package, no monorepo workspaces. `src/main/` is the Electron main process,
`src/preload/` the one bridge script, `src/renderer/` the React app, and
`src/shared/` the contract between the two. There is no browser build — the
app is the only way to run it.

## Commands

```bash
bun install
bun run dev      # scripts/dev.mjs: esbuild main, start Vite, launch Electron at it
bun run test     # `bun test` is Bun's own runner and would find nothing
bun run lint
bun run typecheck
bun run build    # bundle main/preload + vite build the renderer
bun run format   # prettier over the whole repo; format:check is what CI runs
bun run rename "My App"   # once, after cloning: the app's names everywhere
```

`typecheck` runs three TypeScript projects, because the environments do not
share globals: `tsconfig.main.json` (Node), `tsconfig.renderer.json` (DOM), and
`tsconfig.test.json`, which is the one that sees both.

A `Makefile` wraps packaging — `make dmg`, `make app`, `make win`, `make
linux`, `make help` for the rest. Unsigned unless `SIGN=1`.

### Tests

Plain `bun` scripts under `test/`, no test framework — see `test/harness.ts` for
the reasoning. `bun run test` runs `scripts/test.mjs`, which discovers every
`.ts` in that directory (skipping `harness.ts` and `*.local.*`), so adding a
test is dropping a file in. Run one directly while working on it:

```bash
bun test/portfolio.ts
```

Tests touch the world for real rather than a fixture: a temporary directory
through the data-dir environment variable (`DATA_DIR_ENV` in `shared/app.ts`).
The two exceptions are the network and the model: market data comes through an
injected `Fetch` (`MarketData`'s constructor, `createIpc`'s second argument),
and the analyst through an injected `AgentRunner` — so `bun run test` never
spends a request or a token.

## The IPC contract — the one rule that matters

The main process (`src/main/`) and the renderer (`src/renderer/`) **never import
each other**. Everything crossing between them is:

1. a method on `DesktopApi` in `src/shared/api.ts` (types only, no runtime code),
2. a channel name in the `IPC` map (request/response) or `EVENTS` map (pushed
   from main) at the bottom of that same file,
3. a thunk in `src/preload/index.ts`,
4. a handler in `src/main/ipc.ts`.

Adding or changing a call means touching all four. That is deliberate — the
alternative is two sides that disagree about what a call returns.
`test/ipc-contract.ts` fails on a channel with no handler; `tsc` fails on a
missing preload thunk. The renderer reaches the contract through the
`@shared/*` alias; `@/*` is `src/renderer`.

## Main process (`src/main/`)

`main.ts` creates the window and calls `registerIpc()` (`electron-ipc.ts`);
`ipc.ts` owns every handler and the long-lived state as **`createIpc(host)`**, a
table keyed by channel that **does not import `electron`**, so the tests can
import it. What needs Electron itself — the windows, the packaged binary's path — is
`main/host.ts`, implemented by `electron-ipc.ts`. A handler that needs one of
those asks `host`; nothing under `src/main/` that `ipc.ts` imports may reach
`electron`.

- **`data-dir.ts`** — everything on disk lives under `~/<DATA_DIR_NAME>`,
  moved by the env var for tests. Read per call, never captured.
- **`json-file.ts`** — one JSON document, read once, written whole through a
  temp file + rename, writes chained, `update`s serialised (each `change` sees
  the last). A corrupt file reads as the fallback.
- **`settings.ts`** — `settings.json`, read through `DEFAULT_SETTINGS` so a new
  key needs no migration.
- **`market/`** — one file per provider (Binance, VNDirect, Yahoo, CoinGecko +
  Fear & Greed), each a pure `parse*` beside its fetch, and `market-data.ts`
  routing a key (`market:symbol`, `shared/market.ts`) to its provider behind
  a promise cache. VNDirect quotes stocks in thousands of đồng; `parseUdf`
  scales them, so every price past it is plain đồng.
- **`watchlist.ts`**, **`portfolio.ts`** — `JsonFile` stores in the shape every
  feature follows. The portfolio stores the trade ledger only; holdings are
  always derived (`shared/portfolio.ts`), and an oversell is refused there.
- **`ai/`** — `analyst.ts` owns threads and turns and knows nothing of the SDK;
  `claude.ts` is the runner over the Agent SDK; `tools.ts` the read-only MCP
  tools the model gets; `prompt.ts` the system prompt.
- **`protocol.ts`** — the built renderer is served from `app://bundle`, not
  `file://` (no origin there). Path traversal is refused.
- **`menu.ts`** — the application menu sends a `MenuCommand`; the renderer acts
  on it, so each action has one implementation. The edit/window roles are
  restated or ⌘C/⌘V stop working.
- Push events go to **every window** (`host.send`), so a second window never
  draws stale state.
- Links: a `window.open` or a navigation off the app's origin goes to the
  user's browser, and only for `http(s):` / `mailto:` (`keepInside`).

## Renderer (`src/renderer/`)

React 19 + Vite + Tailwind v4. Each feature's logic and zustand store live in
`lib/`, its drawing in `components/`. `components/ui/` is shadcn/ui (Base UI
primitives, `base-nova` style) — add to it with the CLI (`bunx shadcn@latest
add dialog`), not by hand. Vite's root is `src/renderer`, so `index.html` and
`public/` are there too.

- **Theme**: `next-themes` (`components/theme-provider.tsx`, `d` toggles) for
  light/dark; the accent **palette** is a setting in main, written onto
  `<html data-palette>` by `App.tsx`. Every colour is a token in
  `styles/globals.css` — use `bg-primary`, `text-muted-foreground`, never a raw
  Tailwind colour.
- **The title bar** is the app's own on macOS (`titleBarStyle: hiddenInset`);
  keep buttons out of `.drag-region` rather than inside it (`index.css` says
  why).
- **Animation is CSS**, in `styles/motion.css`, as `--animate-*` tokens.
- The window's first-paint colour (`BACKGROUND` in `main/main.ts`) follows the
  dark `--background`; change both together.

### Pure halves, where the tests are

Logic worth testing is split from the drawing. What both sides need lives in
`src/shared/` — `indicators.ts` (the chart draws them, the analyst's
`get_technicals` reads them: one implementation, one answer),
`portfolio.ts` (average-cost holdings, valuation), `market.ts` (keys,
symbols, currencies). The renderer's own pure halves are `lib/format.ts` and
`lib/treemap.ts`. Put new logic on that side of the line.

- **Up/down colour** is `--up` / `--down` (`text-up`, `bg-down/12`), never
  `--success`/`--destructive`. Mix them `in oklab`, not `in oklch`: oklch
  interpolates hue, and the indigo-tinted neutrals turn red into purple.
- **lightweight-charts** cannot read `oklch()` or CSS variables;
  `lib/colors.ts` resolves tokens to `rgba()` and re-reads them on a theme
  switch.

## Constraints that bite

- **The preload is sandboxed.** It cannot `require` anything but `electron` —
  which is why it is bundled — and must not get main's `import.meta` banner
  (`scripts/build-electron.mjs`).
- **Main is bundled to CJS** (`.cjs`, because the package is `"type":
"module"`). A dependency with a native binary must be `external` there and a
  real `dependency` in `package.json`; everything else is a devDependency.
- **The Agent SDK is the one such dependency.** `@anthropic-ai/claude-agent-sdk`
  is `external`, a real `dependency`, loaded by `import()` on the first
  question (it is ESM and large). It runs a platform-specific Claude Code
  binary from its sibling package; `asarUnpack` in `package.json` keeps that
  binary executable, and `claudeExecutable()` in `electron-ipc.ts` points the
  SDK at the unpacked copy.
- **The analyst is isolated from the user's Claude Code setup**:
  `settingSources: []`, `strictMcpConfig`, `tools: ["WebSearch",
"WebFetch"]`, `permissionMode: "dontAsk"`, its own `cwd` under the data
  dir. Its MCP tools are read-only on purpose — don't give it one that writes.
- **Changes under `src/main/`, `src/preload/` or `src/shared/` need `bun run
dev` restarted**; only the renderer hot-reloads (`--hmr=false` turns that
  off too).

## Conventions

- Prettier: no semicolons, double quotes, 80 columns, es5 trailing commas.
- Comments explain **why**, not what — which failure a constant was written
  against, why an approach was rejected. A comment restating the line below it
  is noise.
- `*.local.*` is gitignored scratch. Use that suffix for repros and one-off
  experiments instead of leaving files untracked or committing them.
- Removing a feature means **deleting** it — its store, its channels, its
  tests, its types — rather than hiding it, and recording the argument in
  `docs/design.md`. What is already on a user's disk is left alone.
