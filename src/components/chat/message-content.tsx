"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

// Render assistant/user markdown with GFM + code highlighting.
// Using plain whitespace-pre-wrap wrapper (no @tailwindcss/typography installed).
export function MessageContent({ content }: { content: string }) {
  return (
    <div className="whitespace-pre-wrap break-words text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
