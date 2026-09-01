import { describe, expect, it } from "vitest";
import { assistantDigest } from "./digest";
import { buildAssistantBacklogHandoff } from "./handoff";

const digest = "a".repeat(64);
const proposal = {
  problem: "R2 citations are not yet verified.", desired_outcome: "Verify citations before release.", suggested_title: "Verify R2 citations", suggested_phase: "R2", suggested_priority: "P1" as const, suggested_dependencies: ["Task 7"], suggested_work_mode: "implementation" as const, done_when: "Citation checks pass.", evidence: ["docs/ROADMAP.md"], assumptions: ["The current roadmap is canonical."], unknowns: ["Provider usage"], questions: ["Which fixture?"], citation_source_ids: ["docs/ROADMAP.md"], manifest_digest: digest, model: "MiniMax-M3", mode: "standard" as const, generated_at: "2026-09-01T00:00:00.000Z"
};

describe("buildAssistantBacklogHandoff", () => {
  it("renders a copy-only repository-agent handoff with bound digests", () => {
    const proposal_digest = assistantDigest(proposal);
    const handoff = buildAssistantBacklogHandoff({ ...proposal, proposal_digest });
    expect(handoff).toContain("AllJobs did not edit docs/BACKLOG.md");
    expect(handoff).toContain(`Manifest digest: ${digest}`);
    expect(handoff).toContain(`Proposal digest: ${proposal_digest}`);
    expect(handoff).toContain("Inspect current code and architecture before applying this proposal");
  });

  it("rejects a proposal whose digest does not cover its contents", () => {
    expect(() => buildAssistantBacklogHandoff({ ...proposal, proposal_digest: digest })).toThrow("Proposal digest mismatch");
  });
});
