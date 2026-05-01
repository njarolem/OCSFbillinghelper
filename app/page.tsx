"use client";

import ChatThread from "@/components/ChatThread";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col">
      <Header />
      <ChatThread />
    </main>
  );
}

function Header() {
  return (
    <header className="border-b border-border bg-white">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
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
