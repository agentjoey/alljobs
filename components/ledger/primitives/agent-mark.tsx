const KNOWN_AGENTS = new Set(["claude", "codex", "kimi", "joey"]);

/** agent 章：色标承色、文字用墨；色随实体固定，未知 agent 不染色但文字保留 */
export function AgentMark({ name }: { name: string }) {
  return (
    <span className={KNOWN_AGENTS.has(name) ? `agent ${name}` : "agent"}>
      <i aria-hidden="true" />
      {name}
    </span>
  );
}
