import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "accent"
  | "red"
  | "orange"
  | "green"
  | "gray";

export type BadgeProps = {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
};

// 白字用在纯色底上：red/orange/green/gray 的基础色（非 -text 变体）实测仅
// 2.2–3.55:1，白字远不达 4.5:1（同 accent 的问题，见 accent-text 处注释）。
// -text 变体本就是为「浅底深字」设计的更深色阶，用作纯色底一样通过。
const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-surface-secondary text-label-secondary",
  accent: "bg-accent-text text-label-inverse",
  red: "bg-red-text text-label-inverse",
  orange: "bg-orange-text text-label-inverse",
  green: "bg-green-text text-label-inverse",
  gray: "bg-gray-text text-label-inverse",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-medium leading-none",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
