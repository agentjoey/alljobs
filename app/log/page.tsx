import type { Metadata } from "next";
import { readLedger } from "../../lib/data/read";
import { LogView } from "./log-view";

export const metadata: Metadata = { title: "日志" };

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: PageProps<"/log">) {
  const sp = await searchParams;
  const pick = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const data = readLedger();
  return (
    <LogView
      data={data}
      filters={{ slug: pick(sp.slug), agent: pick(sp.agent), more: pick(sp.more) }}
      now={new Date()}
    />
  );
}
