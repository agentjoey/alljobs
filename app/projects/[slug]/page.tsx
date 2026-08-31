import { notFound } from "next/navigation";
import { ProjectDetail } from "@/components/planning/project-detail";
import { prepareAssistantEntry } from "@/lib/assistant/context";
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

  const assistant = await prepareAssistantEntry(slug);

  return <ProjectDetail detail={{ ...detail, assistant }} />;
}
