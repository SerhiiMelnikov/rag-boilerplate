"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

// Assistant markdown with GFM and code highlighting. Styling lives in the
// `.prose-chat` rules in globals.css, hand-written because 6A allows no new
// dependency and @tailwindcss/typography would ship into every generated project.
//
// No `whitespace-pre-wrap` here: ReactMarkdown already emits block elements, so
// pre-wrap on top of them doubled the spacing and made a single source newline a
// visible break. Removing it is a rendering change, and an intended one.
export function MessageContent({ content }: { content: string }) {
  return (
    <div className="prose-chat break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
