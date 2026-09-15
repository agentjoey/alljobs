import type { Metadata } from "next";
import { AppShell } from "@/components/planning/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "AllJobs — Personal Operations Control Plane",
  description: "Personal operations control plane for project planning, application monitoring, and immutable screenshot capture."
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
