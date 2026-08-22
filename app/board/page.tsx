import type { Metadata } from "next";
import { readLedger } from "@/lib/data/read";
import { readTasks } from "@/lib/data/tasks";
import { BoardView } from "./board-view";

export const metadata: Metadata = { title: "看板" };
export const dynamic = "force-dynamic";

export default function Page() {
  const data = readLedger();
  const knownSlugs = new Set(data.projects.map((p) => p.slug));
  const tasks = readTasks("data", knownSlugs);
  return <BoardView data={data} tasks={tasks} now={new Date()} />;
}
