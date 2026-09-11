import { notFound } from "next/navigation";
import { ProjectMonitoringDetail } from "@/components/monitoring/project-monitoring-detail";
import { getMonitoringProject } from "@/lib/monitoring/queries/project";

// R5 Application Monitoring Project detail (design §11.2). force-dynamic for
// the same reason as the landing page: the view is re-read from the atomic
// cached projection on every request; rendering never fans out to providers.
export const dynamic = "force-dynamic";

export default async function MonitoringProjectPage({
  params
}: {
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  const view = await getMonitoringProject(project);
  if (view.status === "not_found") {
    notFound();
  }
  return <ProjectMonitoringDetail view={view} />;
}
