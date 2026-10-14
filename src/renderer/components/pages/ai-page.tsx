import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BotIcon,
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  GlobeIcon,
  LineChartIcon,
  MessageSquarePlusIcon,
  SquareIcon,
  Trash2Icon,
  TriangleAlertIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react"

import type { AiMessage, AiThread, AiToolUse } from "@shared/api"
import { Markdown } from "@/components/markdown"
import { ModelMenu } from "@/components/model-menu"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useAi } from "@/lib/ai"
import { useNav } from "@/lib/nav"
import { cn, errorMessage } from "@/lib/utils"

const STARTERS = [
  "Tổng quan thị trường crypto hôm nay: tâm lý, dòng tiền, đồng nào mạnh/yếu nhất?",
  "So sánh hiệu suất 90 ngày của BTC, ETH, VN-Index và S&P 500 — lợi nhuận, biến động, sụt giảm tối đa.",
  "Phân tích kỹ thuật FPT khung ngày và đề xuất kịch bản giao dịch.",
  "Đánh giá danh mục của tôi và đề xuất tái cơ cấu.",
]

/** What each tool is, in the transcript's words. */
const TOOL_LABEL: Record<string, string> = {
  get_quotes: "Lấy giá",
  get_technicals: "Phân tích kỹ thuật",
  compare_performance: "So sánh hiệu suất",
  get_crypto_overview: "Tổng quan crypto",
  get_watchlist: "Đọc watchlist",
  get_portfolio: "Đọc danh mục",
  WebSearch: "Tìm kiếm web",
  WebFetch: "Đọc trang web",
}

function toolIcon(name: string): LucideIcon {
  if (name.startsWith("Web")) return GlobeIcon
  if (name === "get_technicals" || name === "compare_performance")
    return LineChartIcon
  return WrenchIcon
}

export function AiPage() {
  const threads = useAi((state) => state.threads)
  const threadId = useNav((state) => state.threadId)
  const openThread = useNav((state) => state.openThread)
  const thread = threads.find((each) => each.id === threadId) ?? null

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border">
        <div className="p-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => openThread(null)}
          >
            <MessageSquarePlusIcon />
            Phân tích mới
          </Button>
        </div>
        <ul className="flex-1 overflow-y-auto px-2 pb-2">
          {threads.map((each) => (
            <li key={each.id}>
              <button
                type="button"
                onClick={() => openThread(each.id)}
                className={cn(
                  "group flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-accent/50",
                  each.id === threadId && "bg-accent"
                )}
              >
                <span className="flex items-center gap-1.5">
                  {each.status === "running" && <Spinner className="size-3" />}
                  <span className="line-clamp-2 flex-1 text-xs font-medium">
                    {each.title}
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(each.updatedAt).toLocaleString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {each.costUsd > 0 && ` · $${each.costUsd.toFixed(3)}`}
                </span>
              </button>
            </li>
          ))}
          {threads.length === 0 && (
            <li className="px-2.5 py-6 text-center text-xs text-muted-foreground">
              Chưa có cuộc hội thoại nào.
            </li>
          )}
        </ul>
      </aside>
      <Conversation key={thread?.id ?? "new"} thread={thread} />
    </div>
  )
}

function awayFromBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight > 240
}

function Conversation({ thread }: { thread: AiThread | null }) {
  const openThread = useNav((state) => state.openThread)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [away, setAway] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  // Pinned rather than "near the bottom": a distance check let a tall table
  // rendering in one go push the view past the threshold and strand it there.
  // Only scrolling up unpins; reaching the bottom again re-pins.
  const pinned = useRef(true)
  const lastTop = useRef(0)
  const running = thread?.status === "running"
  const messages = thread?.messages ?? []
  const last = messages.at(-1)
  const startedAt = [...messages]
    .reverse()
    .find((each) => each.role === "user")?.createdAt

  // Markdown, tables and the tool fold change height after the text that
  // caused them lands, so the size of the content is what keeps the view at
  // the bottom — not the message count.
  useEffect(() => {
    const element = scroller.current
    const inner = content.current
    if (!element || !inner) return
    element.scrollTop = element.scrollHeight
    const observer = new ResizeObserver(() => {
      if (pinned.current) {
        element.scrollTop = element.scrollHeight
        setAway(false)
      } else setAway(awayFromBottom(element))
    })
    observer.observe(inner)
    return () => observer.disconnect()
  }, [])

  function scrollToBottom() {
    const element = scroller.current
    if (!element) return
    pinned.current = true
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" })
  }

  async function send(text: string) {
    const prompt = text.trim()
    if (!prompt || running) return
    setError(null)
    setDraft("")
    pinned.current = true
    try {
      const id = await window.desktop.askAi(thread?.id ?? null, prompt)
      if (!thread) openThread(id)
    } catch (caught) {
      setDraft(prompt)
      setError(errorMessage(caught))
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Vietnamese input methods compose with Enter; that Enter is not a send.
    if (event.nativeEvent.isComposing) return
    if (event.key !== "Enter" || event.shiftKey) return
    event.preventDefault()
    void send(draft)
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-5">
        <BotIcon className="size-4 text-primary" />
        <h1 className="flex-1 truncate text-sm font-medium">
          {thread?.title ?? "AI Analyst"}
        </h1>
        {thread && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Xoá cuộc hội thoại"
            onClick={() => {
              void window.desktop.removeThread(thread.id)
              openThread(null)
            }}
          >
            <Trash2Icon />
          </Button>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={(event) => {
            const element = event.currentTarget
            const { scrollTop, scrollHeight, clientHeight } = element
            setAway(awayFromBottom(element))
            if (scrollHeight - scrollTop - clientHeight < 8)
              pinned.current = true
            else if (scrollTop < lastTop.current - 1) pinned.current = false
            lastTop.current = scrollTop
          }}
          className="h-full overflow-y-auto"
        >
          <div
            ref={content}
            className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6"
          >
            {!thread && <Welcome onPick={(text) => void send(text)} />}
            {messages.map((message, i) => (
              <Message
                key={message.id}
                message={message}
                live={running && i === messages.length - 1}
              />
            ))}
            {running && last && (
              <Working
                startedAt={startedAt}
                label={
                  last.role === "assistant" && last.text
                    ? "Đang viết…"
                    : last.role === "assistant" && last.tools.length
                      ? "Đang phân tích dữ liệu…"
                      : "Đang suy nghĩ…"
                }
              />
            )}
          </div>
        </div>
        {away && (
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Cuộn xuống cuối"
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 animate-pop rounded-full bg-background shadow-md"
          >
            <ArrowDownIcon />
          </Button>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div
            onClick={() => field.current?.focus()}
            className="rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
          >
            <textarea
              ref={field}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                thread
                  ? "Hỏi tiếp…"
                  : "Hỏi về một mã, thị trường hay danh mục của bạn…"
              }
              rows={2}
              autoFocus
              spellCheck={false}
              className="block field-sizing-content max-h-48 min-h-14 w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
            />
            <div className="flex items-center gap-1 px-1.5 pb-1.5">
              <ModelMenu />
              <span className="px-1 text-[11px] text-muted-foreground">
                Enter để gửi · Shift+Enter xuống dòng
              </span>
              <div className="ml-auto flex items-center gap-1">
                {running && (
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="Dừng"
                    onClick={() =>
                      thread && void window.desktop.cancelAi(thread.id)
                    }
                  >
                    <SquareIcon className="fill-current" />
                  </Button>
                )}
                <Button
                  size="icon-sm"
                  variant={draft.trim() && !running ? "default" : "outline"}
                  aria-label="Gửi"
                  disabled={!draft.trim() || running}
                  onClick={() => void send(draft)}
                >
                  <ArrowUpIcon />
                </Button>
              </div>
            </div>
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            Phân tích do AI tạo từ dữ liệu thị trường thực, không phải lời
            khuyên đầu tư. Bạn tự quyết định và chịu rủi ro.
          </p>
        </div>
      </div>
    </div>
  )
}

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-6 pt-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <BotIcon className="size-6" />
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">AI Analyst</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Claude đọc giá trực tiếp, chỉ báo kỹ thuật, watchlist, danh mục của
          bạn và tin tức trên web, rồi phân tích.
        </p>
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {STARTERS.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            className="rounded-xl bg-card p-3 text-left text-sm ring-1 ring-foreground/8 transition-colors hover:bg-accent/50"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

function Message({ message, live }: { message: AiMessage; live: boolean }) {
  if (message.role === "user") {
    return (
      <div className="group flex flex-col items-end gap-1">
        <div className="ml-8 rounded-lg rounded-br-sm bg-accent/60 px-3 py-2 text-sm whitespace-pre-wrap">
          {message.text}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          <time>
            {new Date(message.createdAt).toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
          <CopyButton text={message.text} />
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {message.tools.length > 0 && (
        <ToolFold tools={message.tools} live={live && !message.text} />
      )}
      {message.text && <Markdown text={message.text} />}
      {message.error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs whitespace-pre-wrap text-destructive">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
          {message.error}
        </div>
      )}
      {!live && message.text && (
        <div className="-mt-1 flex">
          <CopyButton text={message.text} label="Sao chép câu trả lời" />
        </div>
      )}
    </div>
  )
}

/**
 * A turn's tool calls as one line, closed by default: a reader wants the
 * answer, and eight chips above it pushed the answer below the fold. Opening
 * it gives each call its own row, with the input it was given.
 */
function ToolFold({ tools, live }: { tools: AiToolUse[]; live: boolean }) {
  const [open, setOpen] = useState(false)
  const icons = [...new Set(tools.map((tool) => toolIcon(tool.name)))]
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-fit items-center gap-1.5 rounded px-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronRightIcon
          className={cn("size-3 transition-transform", open && "rotate-90")}
        />
        {live && <Spinner className="size-3" />}
        <span>
          {live ? "Đang dùng" : "Đã dùng"} {tools.length} công cụ
        </span>
        <span className="flex items-center gap-1 opacity-70">
          {icons.map((Icon, i) => (
            <Icon key={i} className="size-3" />
          ))}
        </span>
      </button>
      {open && (
        <ul className="mt-1 mb-1 ml-2.5 flex animate-fade flex-col gap-0.5 border-l border-border pl-2.5">
          {tools.map((tool, i) => {
            const Icon = toolIcon(tool.name)
            return (
              <li
                key={i}
                title={tool.detail}
                className="flex min-w-0 items-baseline gap-1.5 text-[11px] text-muted-foreground"
              >
                <Icon className="size-3 shrink-0 translate-y-0.5" />
                <span className="shrink-0 font-medium text-foreground/80">
                  {TOOL_LABEL[tool.name] ?? tool.name}
                </span>
                {tool.detail && (
                  <span className="truncate rounded bg-muted px-1 font-mono text-[10px]">
                    {tool.detail}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function CopyButton({
  text,
  label = "Sao chép",
}: {
  text: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label={label}
      title={label}
      className="text-muted-foreground"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => setCopied(true))
      }
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  )
}

/**
 * The turn's loader: three dots hopping in turn and a light passing over the
 * label (`styles/motion.css`), with how long it has been going.
 */
function Working({ label, startedAt }: { label: string; startedAt?: string }) {
  return (
    <div
      role="status"
      className="flex h-5 items-center gap-2 px-1 text-xs text-muted-foreground"
    >
      <span className="flex items-center gap-1 px-0.5" aria-hidden>
        {[0, 140, 280].map((delay) => (
          <span
            key={delay}
            className="size-1.25 animate-dot rounded-full bg-primary"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      <span className="text-shimmer">{label}</span>
      {startedAt && <Elapsed since={Date.parse(startedAt)} />}
    </div>
  )
}

/**
 * Its own component so the once-a-second tick redraws this line, not the
 * transcript of rendered markdown above it.
 */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.floor((now - since) / 1000))
  return (
    <span className="text-muted-foreground/50 tabular-nums">
      {seconds < 60
        ? `${seconds}s`
        : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}
    </span>
  )
}
