import { cn } from "@/lib/utils";

export type DetailCardProps = {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function DetailCard({ title, children, className }: DetailCardProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-hairline bg-surface p-4",
        className,
      )}
    >
      {title && (
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
