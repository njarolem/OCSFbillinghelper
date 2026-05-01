"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  role: "user" | "assistant";
  children?: React.ReactNode;
  /** Plain text or markdown for assistant messages. */
  markdown?: string;
}

export default function MessageBubble({ role, children, markdown }: Props) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} my-2`}>
      <div
        className={[
          "max-w-[85%] px-4 py-3 rounded-lg shadow-card",
          isUser
            ? "bg-userBubble text-slate-900"
            : "bg-white border border-border text-slate-800",
        ].join(" ")}
      >
        {markdown !== undefined ? (
          <div className="md-prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          </div>
        ) : (
          <div className="whitespace-pre-wrap">{children}</div>
        )}
      </div>
    </div>
  );
}
