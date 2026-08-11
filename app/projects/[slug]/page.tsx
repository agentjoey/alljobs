import type { Metadata } from "next";
import { readLedger } from "../../../lib/data/read";
import { DetailView } from "./detail-view";
import { ProjectNotFound } from "./not-found-view";

export const metadata: Metadata = { title: "项目详情" };

export const dynamic = "force-dynamic";

export default async function Page({ params }: PageProps<"/projects/[slug]">) {
  const { slug } = await params;
  const data = readLedger();
  const now = new Date();
  if (!data.projects.some((p) => p.slug === slug)) {
    return <ProjectNotFound data={data} slug={slug} now={now} />;
  }
  return <DetailView data={data} slug={slug} now={now} />;
}
