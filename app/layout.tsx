import type { Metadata } from "next";
import { AppShell } from "@/components/planning/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "AllJobs — Federated Planning Core",
  description: "Personal multi-project planning workbench for code and business initiatives"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
