"use client";

import { useEffect, useState } from "react";
import { listSessions, deleteSession } from "@/lib/sessionStore";
import type { StoredSession } from "@/lib/sessionStore";

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SessionSidebar({
  onLoad,
  refreshKey,
}: {
  onLoad: (session: StoredSession) => void;
  refreshKey: number;
}) {
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setSessions(listSessions());
  }, [refreshKey]);

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    deleteSession(id);
    setSessions(listSessions());
  }

  return (
    <div
      className={`flex flex-col border-r border-border bg-slate-50 transition-all duration-200 ${
        open ? "w-64 min-w-[16rem]" : "w-10 min-w-[2.5rem]"
      }`}
    >
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        {open && (
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Past Cases
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="ml-auto text-slate-400 hover:text-accent"
          title={open ? "Collapse sidebar" : "Expand sidebar"}
        >
          {open ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      {open && (
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="text-xs text-slate-400 text-center mt-6 px-3">
              No saved cases yet.
            </p>
          ) : (
            <ul className="py-1">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onLoad(s)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-100 group relative"
                  >
                    <p className="text-xs text-slate-400 leading-none mb-1">
                      {formatTimestamp(s.timestamp)}
                    </p>
                    <p className="text-sm font-medium text-slate-700 truncate">
                      {s.dosDisplay} · {s.county}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {s.cptCodes.join(", ")}
                    </p>
                    <span
                      role="button"
                      onClick={(e) => handleDelete(e, s.id)}
                      className="absolute right-2 top-2 hidden group-hover:block text-slate-300 hover:text-red-400 text-xs leading-none"
                      title="Delete"
                    >
                      ✕
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
