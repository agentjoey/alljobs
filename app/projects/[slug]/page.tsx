import { notFound } from "next/navigation";
import { ProjectDetail } from "@/components/planning/project-detail";
import { getProjectDetail } from "@/lib/planning/queries/project";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getProjectDetail(slug);

  if (!detail) {
    notFound();
  }

  return <ProjectDetail detail={detail} />;
}
