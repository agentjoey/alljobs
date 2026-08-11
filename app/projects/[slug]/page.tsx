import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readLedger } from "../../../lib/data/read";
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
  // slug 不存在必须回 404（而非 200 的「404 页」）；内容在同级 not-found.tsx。
  // 注意：[slug] 的祖先链上不能有任何 loading.tsx——Suspense 流式渲染会抢在
  // notFound() 之前发出 200 响应头（soft 404）。骨架因此收进 (overview)/(list)/log 路由组。
  if (!data.projects.some((p) => p.slug === slug)) notFound();
  return <DetailView data={data} slug={slug} now={new Date()} />;
}
