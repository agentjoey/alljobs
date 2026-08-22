import { cn } from "@/lib/utils";

export type SplitViewProps = {
  sidebar: React.ReactNode;
  list?: React.ReactNode;
  detail?: React.ReactNode;
  listClassName?: string;
  detailClassName?: string;
  className?: string;
};

export function SplitView({
  sidebar,
  list,
  detail,
  listClassName,
  detailClassName,
  className,
}: SplitViewProps) {
  const hasList = list !== undefined;
  const hasDetail = detail !== undefined;

  return (
    <div
      className={cn(
        "grid min-h-screen grid-cols-1 bg-bg md:grid-cols-[240px_1fr]",
        hasList && hasDetail && "lg:grid-cols-[240px_360px_1fr]",
        className,
      )}
    >
      <aside className="hidden min-h-0 flex-col overflow-hidden md:flex">
        {sidebar}
      </aside>
      {hasList && (
        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden border-r border-hairline bg-bg",
            listClassName,
          )}
        >
          {list}
        </section>
      )}
      {hasDetail && (
        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden bg-bg",
            detailClassName,
          )}
        >
          {detail}
        </section>
      )}
    </div>
  );
}
