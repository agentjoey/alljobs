import { cn } from "@/lib/utils";

export type AgentPillProps = {
  agent: string;
  className?: string;
};

const agentColors: Record<string, string> = {
  claude: "bg-agent-claude",
  codex: "bg-agent-codex",
  kimi: "bg-agent-kimi",
  joey: "bg-agent-joey",
};

export function AgentPill({ agent, className }: AgentPillProps) {
  const normalized = agent.toLowerCase();
  const color = agentColors[normalized] ?? "bg-gray";

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium text-white",
        color,
        className,
      )}
    >
      <span className="h-2 w-2 rounded-full bg-white/80" aria-hidden="true" />
      {agent}
    </span>
  );
}
