import { readLedger } from "@/lib/data/read";
import { ProjectsShell } from "@/components/workbench/ProjectsShell";
import { ProjectsList } from "./projects-list";

export const dynamic = "force-dynamic";

export default async function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = readLedger();
  return (
    <ProjectsShell
      data={data}
      now={new Date()}
      list={<ProjectsList data={data} now={new Date()} />}
    >
      {children}
    </ProjectsShell>
  );
}
