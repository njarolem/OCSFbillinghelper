"use client";

import { useState } from "react";

interface Props {
  placeholder: string;
  onSubmit: (text: string) => void;
  disabled?: boolean;
  multiline?: boolean;
}

export default function CaseInputBox({
  placeholder,
  onSubmit,
  disabled,
  multiline = true,
}: Props) {
  const [value, setValue] = useState("");

  function submit() {
    const t = value.trim();
    if (!t) return;
    onSubmit(t);
    setValue("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-border bg-white p-3">
      <div className="max-w-4xl mx-auto flex gap-2 items-end">
        {multiline ? (
          <textarea
            value={value}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={3}
            className="flex-1 resize-none rounded-md border border-border px-3 py-2 text-sm bg-white"
          />
        ) : (
          <input
            type="text"
            value={value}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="flex-1 h-10 rounded-md border border-border px-3 text-sm bg-white"
          />
        )}
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="h-10 px-4 rounded-md bg-accent text-white text-sm font-medium hover:bg-sky-800 disabled:opacity-50"
        >
          Send
        </button>
      </div>
      <p className="text-xs text-slate-400 mt-1 max-w-4xl mx-auto">
        ⌘/Ctrl+Enter to send
      </p>
    </div>
  );
}
