import type { Metadata } from "next";
import { readLedger } from "@/lib/data/read";
import { TodayView } from "../today-view";

export const metadata: Metadata = { title: "今天" };
export const dynamic = "force-dynamic";

export default function Page() {
  const data = readLedger();
  return <TodayView data={data} now={new Date()} />;
}
