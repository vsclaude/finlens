# FinLens

A desktop market-analysis app for investors in crypto, Vietnamese stocks and
US stocks, with an AI analyst built on the Claude Agent SDK. The interface is
in Vietnamese.

- **Tổng quan** — portfolio value and P&L, VN-Index / S&P 500 / Bitcoin, the
  watchlist with 30-day sparklines, Fear & Greed, the day's biggest crypto
  movers, one-click questions for the analyst
- **Thị trường** — indices and macro (VN-Index, VN30, HNX, S&P 500, Nasdaq,
  Dow, gold, USD/VND), a market-cap heatmap of the top 50 coins, the top-60
  table with 7-day sparklines
- **Biểu đồ** — candlesticks at 1H/4H/1D/1W with MA, Bollinger, volume, RSI
  and MACD, a technical-signal summary and key levels
- **Danh mục** — a trade ledger with average-cost holdings, realised and
  unrealised P&L, allocation by position and by market, totals in USD or VND
- **AI Analyst** — Claude reads live quotes, indicators, your watchlist and
  portfolio, and the news, and answers with a sourced analysis; follow-ups
  continue the conversation

Market data is keyless: Binance, VNDirect, Yahoo Finance, CoinGecko and
alternative.me. The analyst uses an Anthropic API key from Settings, or
`ANTHROPIC_API_KEY`, or your existing Claude Code login.

## Start

```bash
bun install
bun run dev
```

Requires [Bun](https://bun.sh) 1.3+ and Node 20+.

## Commands

| Command                                | What it does                                               |
| -------------------------------------- | ---------------------------------------------------------- |
| `bun run dev`                          | Build main, start Vite, launch Electron (renderer HMR)     |
| `bun run test`                         | Every `test/*.ts`, each as its own process                 |
| `bun run typecheck`                    | Main, renderer and tests as three TS projects              |
| `bun run lint`                         | ESLint, zero warnings allowed                              |
| `bun run format`                       | Prettier                                                   |
| `bun run build`                        | Bundle everything into `dist-electron/` + `dist-renderer/` |
| `make dmg` / `make win` / `make linux` | An installer in `release/`                                 |

## Layout

```
src/
  shared/    the contract (api.ts) and the logic both sides run:
             indicators.ts, portfolio.ts, market.ts
  main/      Electron main — ipc.ts (handlers), market/ (providers + cache),
             watchlist.ts, portfolio.ts, api-key-store.ts, ai/ (analyst,
             Agent SDK runner, MCP tools, prompt)
  preload/   index.ts — the one bridge, window.desktop
  renderer/  React — App.tsx, components/pages/, components/charts/,
             components/ui/ (shadcn), lib/ (stores, formatting, treemap)
test/        harness.ts + one file per subject
```

`docs/design.md` explains how each part works and why; `CLAUDE.md` is the
operating manual for working on it.

## Adding a call between main and the renderer

Four places, every time (`CLAUDE.md` says why):

1. **`src/shared/api.ts`** — the method on `DesktopApi`, and its channel in
   `IPC` (or `EVENTS` for a push from main).
2. **`src/preload/index.ts`** — the thunk.
3. **`src/main/ipc.ts`** — the handler (anything Electron-specific goes
   through `host`).
4. **The renderer** calls `window.desktop.…`.

`test/ipc-contract.ts` fails if step 3 is missing; `tsc` fails if step 2 is.

## Disclaimer

FinLens shows analysis, not investment advice. Market data comes from free,
unofficial endpoints and may be delayed or wrong; the AI can be wrong too.
