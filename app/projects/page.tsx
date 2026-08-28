import { ProjectList } from "@/components/planning/project-list";
import { NativePlanningStore } from "@/lib/planning/native/store";
import { getProjectDetail, type ProjectDetailView } from "@/lib/planning/queries/project";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const store = new NativePlanningStore();
  const rawProjects = await store.listProjects();
  const activeProjects = rawProjects.filter(p => !p.archived);

  const projectDetails: ProjectDetailView[] = [];
  for (const p of activeProjects) {
    const detail = await getProjectDetail(p.slug);
    if (detail) projectDetails.push(detail);
  }

  return <ProjectList projects={projectDetails} />;
}
