import { cn } from "@/lib/utils";

export type StatusDotProps = {
  status: string;
  label?: string;
  className?: string;
};

const statusColors: Record<string, string> = {
  active: "bg-status-active",
  blocked: "bg-status-blocked",
  paused: "bg-status-paused",
  done: "bg-status-done",
  due: "bg-status-due",
};

export function StatusDot({ status, label, className }: StatusDotProps) {
  const color = statusColors[status.toLowerCase()] ?? "bg-gray";
  const text = label ?? status;

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      title={text}
    >
      <span
        className={cn("h-2 w-2 rounded-full", color)}
        aria-hidden="true"
      />
      {label && (
        <span className="text-[12px] text-label-secondary">{label}</span>
      )}
    </span>
  );
}
