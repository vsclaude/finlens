import { memo } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

/**
 * The analyst's answers. Styled element by element rather than through a
 * typography plugin: it is one surface with a dozen elements, and the plugin
 * would be a second set of colours to keep in step with the tokens.
 *
 * Raw HTML is not rendered (react-markdown's default) — the answer quotes web
 * pages, and a page's markup has no business running in the app.
 */
const components: Components = {
  h1: (props) => (
    <h3 className="mt-4 mb-2 text-base font-semibold first:mt-0" {...props} />
  ),
  h2: (props) => (
    <h3 className="mt-4 mb-2 text-base font-semibold first:mt-0" {...props} />
  ),
  h3: (props) => (
    <h4 className="mt-4 mb-1.5 text-sm font-semibold first:mt-0" {...props} />
  ),
  h4: (props) => (
    <h5 className="mt-3 mb-1 text-sm font-medium first:mt-0" {...props} />
  ),
  p: (props) => (
    <p className="my-2 leading-relaxed first:mt-0 last:mb-0" {...props} />
  ),
  ul: (props) => <ul className="my-2 ml-5 list-disc space-y-1" {...props} />,
  ol: (props) => <ol className="my-2 ml-5 list-decimal space-y-1" {...props} />,
  li: (props) => (
    <li className="leading-relaxed marker:text-muted-foreground" {...props} />
  ),
  strong: (props) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  a: (props) => (
    <a
      className="text-primary underline underline-offset-2"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote
      className="my-2 border-l-2 border-primary/50 pl-3 text-muted-foreground"
      {...props}
    />
  ),
  hr: () => <hr className="my-4 border-border" />,
  code: ({ className, ...props }) => (
    <code
      className={`rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] ${className ?? ""}`}
      {...props}
    />
  ),
  pre: (props) => (
    <pre
      className="my-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs"
      {...props}
    />
  ),
  table: (props) => (
    <div className="my-3 overflow-x-auto rounded-lg ring-1 ring-border">
      <table className="w-full text-xs" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-muted/60" {...props} />,
  th: (props) => (
    <th
      className="px-2.5 py-1.5 text-left font-medium whitespace-nowrap"
      {...props}
    />
  ),
  td: (props) => (
    <td className="tabular border-t border-border px-2.5 py-1.5" {...props} />
  ),
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="text-sm text-foreground/90">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
})
