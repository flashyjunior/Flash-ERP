import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Flash ERP Enterprise",
  description: "Enterprise control plane for Flash ERP",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
