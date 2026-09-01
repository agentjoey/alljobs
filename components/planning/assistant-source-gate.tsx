import type { SourceAccessProposal } from "@/lib/assistant/contracts";

export function AssistantSourceGate({ proposal, disabled, onInspect, onDecline }: {
  proposal: SourceAccessProposal;
  disabled: boolean;
  onInspect: () => void;
  onDecline: () => void;
}) {
  return (
    <section className="assistant-source-gate" aria-label="Additional source access">
      <h3>Additional source access</h3>
      <p>{proposal.purpose}</p>
      <p>Capabilities: {proposal.requested_capabilities.join(", ")}</p>
      <p className="assistant-source-gate__limits">Up to {proposal.max_files} files · {proposal.max_bytes.toLocaleString()} bytes · {proposal.max_tool_calls} reads</p>
      <p>Expected facts: {proposal.expected_facts.length > 0 ? proposal.expected_facts.join("; ") : "None declared."}</p>
      <p>Expires: {proposal.expires_at}</p>
      <div className="assistant-source-gate__actions">
        <button className="btn btn--primary" type="button" onClick={onInspect} disabled={disabled}>Inspect source</button>
        <button className="btn" type="button" onClick={onDecline} disabled={disabled}>Answer without source</button>
      </div>
    </section>
  );
}
