import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readLedger } from "@/lib/data/read";
import { readTasks } from "@/lib/data/tasks";
import { DetailView } from "./detail-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/projects/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const project = readLedger().projects.find((p) => p.slug === slug);
  return { title: project?.title ?? "查无此页" };
}

export default async function Page({ params }: PageProps<"/projects/[slug]">) {
  const { slug } = await params;
  const data = readLedger();
  if (!data.projects.some((p) => p.slug === slug)) notFound();
  const knownSlugs = new Set(data.projects.map((p) => p.slug));
  const tasks = readTasks("data", knownSlugs);
  return <DetailView data={data} slug={slug} now={new Date()} tasks={tasks} />;
}
