# Design

What each part of the app does and why — and, as the app grows, every argument
that was had and every feature that was removed. `CLAUDE.md` is the operating
manual; this is the fuller account. When the two disagree, this one wins.

## The shape

Three processes' worth of code and one contract:

- **Main** (`src/main/`) owns everything on disk, everything on the network
  and everything the OS does. Its handlers are a plain table (`createIpc`)
  that never imports `electron`, so every one of them can be called from a
  test with a fake `Host`.
- **Preload** (`src/preload/`) is sandboxed and does one thing: expose
  `window.desktop`, typed `DesktopApi`.
- **Renderer** (`src/renderer/`) is a React app that knows main only through
  `window.desktop`.
- **Shared** (`src/shared/`) is the contract, plus the pure logic both sides
  run — indicators, portfolio arithmetic, instrument keys — where two copies
  would be two answers.

## Data on disk

Everything lives under `~/.finlens`, one JSON file per concern, each written
whole through a temp file and a rename (`main/json-file.ts`): `settings.json`,
`watchlist.json`, `portfolio.json`, `ai-threads.json`, `api-key.json`. Settings
are read through their defaults, so adding one never needs a migration. A file
the app no longer reads is left where it is rather than deleted.

The analyst also has a working directory, `~/.finlens/ai`, which is where the
Agent SDK's session transcripts are keyed from (they live under
`~/.claude/projects/`, as every Claude Code session's do).

## Market data

Four keyless providers, fetched from main (no CORS, one cache for every
window):

| Market       | Provider                   | Why it                                       |
| ------------ | -------------------------- | -------------------------------------------- |
| `crypto`     | Binance `data-api` mirror  | Deepest books; the mirror is not geo-blocked |
| `vn`         | VNDirect dchart (UDF)      | HOSE, HNX, UPCoM and the indices on one feed |
| `us`         | Yahoo chart API            | Stocks, indices, FX and futures on one feed  |
| market table | CoinGecko + alternative.me | Market caps, 7-day sparklines, Fear & Greed  |

An instrument is a key, `market:symbol` (`crypto:BTCUSDT`, `vn:FPT`,
`us:^GSPC`). The key is what the watchlist stores, what the ledger stores and
what the model passes to its tools, so all three agree on what "FPT" is.

Things learned the hard way:

- **VNDirect** quotes stocks in thousands of đồng and indices in points,
  answers a strict `Accept: application/json` with a 406, and has no weekly
  resolution at all — `W` gets a 200 whose body is the prose "Not support
  resolution W". Weeks are folded from ten years of daily bars, Monday-aligned.
- **Yahoo** answers a client without a browser user agent with 429s, and
  `chartPreviousClose` is only yesterday's close for `range=1d`.
- **Binance** fails a whole `ticker/24hr?symbols=` batch for one unknown pair,
  so a failed batch is retried pair by pair.
- No provider offers 4h bars for VN or US; they are aggregated from hourly bars
  on epoch-aligned buckets, which happens to split a Hanoi session into its
  morning and afternoon.

The cache holds promises (a dashboard and a chart asking for the same quote is
one request), keeps quotes 15s and candles 60s, and drops a failure at once.

## Indicators

SMA, EMA (SMA-seeded), Wilder's RSI and ATR, MACD, Bollinger, and a summary
that turns them into textbook signals and a −1…1 score. Deliberately the
textbook versions: they are what a reader will check against TradingView, and
the point of the summary is a reading the user can verify on the chart, not a
strategy.

They live in `shared/` because both sides use them — the chart draws them,
the analyst's `get_technicals` hands them to the model. One implementation
means the model and the chart cannot disagree about the RSI.

## Portfolio

A ledger of trades, never a table of holdings: holdings are derived on every
read (`computeHoldings`), so editing or removing a trade can never leave a
stale position. Average-cost accounting, because that is what Vietnamese
brokers show; a sell realises against the average and leaves it alone. A sell
of more than was held on its date is refused — on add, and on removing the buy
it depended on.

Prices are in the instrument's own currency (VND for `vn`, USD otherwise) and
totals are converted to the base currency setting through Yahoo's `USDVND=X`.
A position with no price or no rate is listed but left out of the totals, and
said so, rather than counted as zero.

## The AI analyst

Claude through the **Claude Agent SDK** — the same engine as Claude Code, with
the coding taken out:

- Built-in tools are cut to `WebSearch` and `WebFetch` (news). Everything else
  it can do is six in-process MCP tools (`main/ai/tools.ts`): quotes,
  technicals, performance comparison, the crypto overview, the watchlist and
  the portfolio. All read-only — a trade the model "records" would be a trade
  nobody made.
- Isolated from the user's own Claude Code configuration: no settings files,
  no CLAUDE.md, no other MCP servers, `dontAsk` so anything off the
  allow-list is refused instead of prompting a terminal nobody is watching.
- The system prompt replaces Claude Code's, and its first rule is that every
  number must come from a tool result in the conversation.
- Each thread keeps the SDK session id, so a follow-up resumes with the
  conversation behind it.
- Auth: a key saved in Settings (sealed by the OS keychain), else
  `ANTHROPIC_API_KEY`, else the user's own `claude` login on the machine.
- The model and its effort level are picked in the composer (the same
  `ModelMenu` sits in Settings), after Visual Studio Claude's picker. **The rows
  are the CLI's**, asked through the SDK's `supportedModels()` — a process and
  no tokens, ~2.5s cold, held for the run and dropped when the API key changes
  (`main/ai/models.ts`). A written list was the earlier design and is wrong in
  one direction or the other: which models exist is a property of the account,
  so it either offers one the account cannot use or hides one it pays for.
  When the CLI cannot be asked, the picker falls back to the three aliases
  with no levels. Both are settings, read at the start of each turn, so a
  switch applies to the next question — mid-thread too. Its `Inherit` row was
  not carried over: the analyst never reads the user's Claude Code settings,
  so there is nothing to inherit. Opus by default; a short read on Haiku costs
  about two cents.

A turn streams into a working copy of its thread, pushed to the windows every
80ms and written to disk once when it ends. `Analyst` takes the runner as a
function, so `test/analyst.ts` drives the whole lifecycle with a script and no
model.

## The example: todos, removed

The template shipped a todo list to show each layer once. It went when the
first real feature arrived, as the template asked; nothing of it was ever on a
FinLens user's disk.
