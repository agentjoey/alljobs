import type { Metadata } from "next";
import { readLedger } from "../../../lib/data/read";
import { ProjectsView } from "../projects-view";

export const metadata: Metadata = { title: "项目" };

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: PageProps<"/projects">) {
  const sp = await searchParams;
  const pick = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const data = readLedger();
  return (
    <ProjectsView
      data={data}
      filters={{ status: pick(sp.status), type: pick(sp.type), agent: pick(sp.agent) }}
      now={new Date()}
    />
  );
}
