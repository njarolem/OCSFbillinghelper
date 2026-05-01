"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function FCSOWarning({ markdown }: { markdown: string }) {
  if (!markdown) return null;
  return (
    <aside className="border border-amber-300 bg-amber-50 rounded-lg p-4 my-3 text-sm text-amber-900">
      <div className="md-prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: (props) => (
              <a
                {...props}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline"
              />
            ),
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </aside>
  );
}
