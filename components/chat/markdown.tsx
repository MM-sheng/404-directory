"use client"

import { CheckIcon, CopyIcon } from "lucide-react"
import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { stabilizeMarkdown } from "@/lib/markdown"

export function Markdown({
  content,
  streaming = false,
}: {
  content: string
  streaming?: boolean
}) {
  return (
    <div className="chat-markdown text-[15px] leading-[1.75]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={streaming ? REVEAL_COMPONENTS : BASE_COMPONENTS}
      >
        {stabilizeMarkdown(content, streaming)}
      </ReactMarkdown>
    </div>
  )
}

function Anchor({ href, children }: { href?: string; children?: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

function Code({ className, children, ...props }: React.ComponentProps<"code">) {
  if (className) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  }

  return (
    <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...props}>
      {children}
    </code>
  )
}

const BASE_COMPONENTS = {
  a: Anchor,
  code: Code,
  pre: ({ children }: { children?: React.ReactNode }) => (
    <CodeBlock>{children}</CodeBlock>
  ),
}

/**
 * While streaming, text is split into per-word spans. Word N keeps key N across
 * renders, so React only mounts spans for words that just arrived and the CSS
 * mount animation fires exactly once per word.
 */
const REVEAL_COMPONENTS = {
  ...BASE_COMPONENTS,
  pre: ({ children }: { children?: React.ReactNode }) => (
    <CodeBlock reveal>{children}</CodeBlock>
  ),
  p: revealBlock("p"),
  li: revealBlock("li"),
  h1: revealBlock("h1"),
  h2: revealBlock("h2"),
  h3: revealBlock("h3"),
  blockquote: revealBlock("blockquote"),
  td: revealBlock("td"),
  th: revealBlock("th"),
}

type BlockTag = "p" | "li" | "h1" | "h2" | "h3" | "blockquote" | "td" | "th"

function revealBlock(Tag: BlockTag) {
  return function RevealBlock({ children }: { children?: React.ReactNode }) {
    return <Tag>{revealWords(children, { current: 0 })}</Tag>
  }
}

function revealWords(
  node: React.ReactNode,
  counter: { current: number }
): React.ReactNode {
  if (typeof node === "string") {
    // Whitespace is left as bare text nodes so inline flow and `pre`
    // indentation survive the split.
    return node.split(/(\s+)/).map((part) => {
      if (!part || /^\s+$/.test(part)) {
        return part
      }

      return (
        <span key={counter.current++} className="token-in">
          {part}
        </span>
      )
    })
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => (
      <React.Fragment key={index}>{revealWords(child, counter)}</React.Fragment>
    ))
  }

  if (React.isValidElement<{ children?: React.ReactNode; className?: string }>(node)) {
    // Inline code reveals as one unit rather than being torn into words.
    if (node.type === Code && !node.props.className) {
      return (
        <span key={counter.current++} className="token-in">
          {node}
        </span>
      )
    }

    return React.cloneElement(node, undefined, revealWords(node.props.children, counter))
  }

  return node
}

function CodeBlock({
  reveal = false,
  children,
}: {
  reveal?: boolean
  children: React.ReactNode
}) {
  const [copied, setCopied] = React.useState(false)
  const text = extractText(children)

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success("Copied")
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="group/code relative my-4 overflow-hidden rounded-lg border border-border/70 bg-muted/40">
      <div className="absolute top-1.5 right-1.5 opacity-0 motion-safe:transition-opacity group-hover/code:opacity-100 focus-within:opacity-100">
        <Button variant="ghost" size="icon-xs" onClick={copy} aria-label="Copy code">
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 pr-10 font-mono text-[13px] leading-6 text-foreground/80">
        {reveal ? revealWords(children, { current: 0 }) : children}
      </pre>
    </div>
  )
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node)
  }

  if (Array.isArray(node)) {
    return node.map(extractText).join("")
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractText(node.props.children)
  }

  return ""
}
