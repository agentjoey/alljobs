import Link from "next/link";
import { deriveProjects } from "@/lib/data/derive";
import type { LedgerData } from "@/lib/data/types";
import { EmptyState } from "@/components/workbench";
import { sortForIndex } from "@/components/workbench/lib";

export type ProjectNotFoundProps = {
  data: LedgerData;
  slug?: string;
  now: Date;
};

export function ProjectNotFound({ data, slug, now }: ProjectNotFoundProps) {
  const derived = sortForIndex(deriveProjects(data.projects, data.entries, now));
  const suggestions = derived
    .filter((p) => p.lastEntry)
    .slice(0, 3)
    .map((p) => p.slug);

  return (
    <div className="flex h-full items-center justify-center p-6">
      <EmptyState
        title="查无此页"
        description={
          slug
            ? `底账里没有 ${slug} 这一项。`
            : "底账里没有这一项。"
        }
        action={
          <div className="flex flex-col items-center gap-2 text-[13px] text-accent-text">
            {suggestions.map((s) => (
              <Link key={s} href={`/projects/${s}`} className="hover:underline">
                {s} →
              </Link>
            ))}
            <Link href="/projects" className="hover:underline">
              项目索引 →
            </Link>
          </div>
        }
      />
    </div>
  );
}
