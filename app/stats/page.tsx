import type { Metadata } from "next";
import { readLedger } from "@/lib/data/read";
import { readTasks } from "@/lib/data/tasks";
import { deriveStats } from "@/lib/data/stats";
import { StatsView } from "./stats-view";

export const metadata: Metadata = { title: "统计" };
export const dynamic = "force-dynamic";

export default function Page() {
  const data = readLedger();
  const knownSlugs = new Set(data.projects.map((p) => p.slug));
  const tasks = readTasks("data", knownSlugs);
  const stats = deriveStats(data, tasks, new Date());
  return <StatsView data={data} stats={stats} now={new Date()} />;
}
