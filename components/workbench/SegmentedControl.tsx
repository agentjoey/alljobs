import { cn } from "@/lib/utils";
import { Badge } from "./Badge";

export type SegmentedControlOption<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

export type SegmentedControlProps<T extends string> = {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label="分段过滤"
      className={cn(
        "inline-flex items-center rounded-lg border border-hairline bg-surface-secondary p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            data-active={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-label-secondary transition-state",
              "data-[active=true]:bg-surface data-[active=true]:text-label-primary data-[active=true]:shadow-sm",
              "hover:text-label-primary",
            )}
          >
            {option.label}
            {option.count !== undefined && option.count > 0 && (
              <Badge variant="default">{option.count}</Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
