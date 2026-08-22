import type { Metadata } from "next";
import { readLedger } from "@/lib/data/read";
import { LogView } from "./log-view";

export const metadata: Metadata = { title: "日志" };
export const dynamic = "force-dynamic";

export default function Page() {
  const data = readLedger();
  return <LogView data={data} now={new Date()} />;
}
