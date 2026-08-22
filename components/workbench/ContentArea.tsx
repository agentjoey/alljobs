import { cn } from "@/lib/utils";

export type ContentAreaProps = {
  children: React.ReactNode;
  className?: string;
};

export function ContentArea({ children, className }: ContentAreaProps) {
  return (
    <main
      className={cn(
        "flex-1 overflow-auto bg-bg p-6",
        className,
      )}
    >
      <div className="mx-auto max-w-5xl">{children}</div>
    </main>
  );
}
