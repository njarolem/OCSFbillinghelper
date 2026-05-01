"use client";

import { useState } from "react";
import ChatThread from "@/components/ChatThread";
import SessionSidebar from "@/components/SessionSidebar";
import type { StoredSession } from "@/lib/sessionStore";

export default function HomePage() {
  const [viewSession, setViewSession] = useState<StoredSession | null>(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  function handleSessionSaved() {
    setSidebarRefreshKey((k) => k + 1);
  }

  function handleLoadSession(session: StoredSession) {
    setViewSession(session);
  }

  function handleNewCase() {
    setViewSession(null);
  }

  return (
    <main className="min-h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <SessionSidebar
          onLoad={handleLoadSession}
          refreshKey={sidebarRefreshKey}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <ChatThread
            viewSession={viewSession}
            onSessionSaved={handleSessionSaved}
            onNewCase={handleNewCase}
          />
        </div>
      </div>
    </main>
  );
}

function Header() {
  return (
    <header className="border-b border-border bg-white">
      <div className="max-w-full px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-accent">OCSFbillinghelper</h1>
          <p className="text-xs text-slate-500">
            Florida LOP billing — 120% Medicare cap, computed locally.
          </p>
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}

function SignOutButton() {
  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    window.location.href = "/login";
  }
  return (
    <button
      type="button"
      onClick={signOut}
      className="text-sm text-slate-500 hover:text-accent"
    >
      Sign out
    </button>
  );
}
