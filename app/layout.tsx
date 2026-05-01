import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OCSFbillinghelper",
  description:
    "Florida orthopedic LOP billing helper — 120% Medicare cap calculator.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased min-h-screen bg-canvas text-slate-900">
        {children}
      </body>
    </html>
  );
}
