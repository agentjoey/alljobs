// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { parseCaphubReleaseArgs, runCaphubRelease } from "./caphub-release";

const CANDIDATE_ID = `cand_${"a".repeat(32)}`;
const RELEASE_ID = `rel_${"b".repeat(32)}`;
const DECISION_ID = `dec_${"c".repeat(32)}`;

describe("caphub-release command boundary", () => {
  it("accepts only compose/finalize identifiers and optional bounded learn kind", () => {
    expect(parseCaphubReleaseArgs(["--compose", "--candidate", CANDIDATE_ID, "--decision", DECISION_ID]))
      .toEqual({ action: "compose", candidateId: CANDIDATE_ID, decisionId: DECISION_ID });
    expect(parseCaphubReleaseArgs([
      "--compose", "--candidate", CANDIDATE_ID, "--decision", DECISION_ID, "--learn-kind", "experience_card"
    ])).toEqual({ action: "compose", candidateId: CANDIDATE_ID, decisionId: DECISION_ID, learnKind: "experience_card" });
    expect(parseCaphubReleaseArgs(["--finalize", "--release", RELEASE_ID, "--decision", DECISION_ID]))
      .toEqual({ action: "finalize", releaseId: RELEASE_ID, decisionId: DECISION_ID });
    for (const args of [
      [], ["--publish"], ["--install"], ["--rollback"], ["--target", "codex"],
      ["--root", "/tmp"], ["--database-url", "postgresql://secret"], ["--sql", "select 1"],
      ["--compose", "--candidate", CANDIDATE_ID, "--decision", DECISION_ID, "--learn-kind", "plugin"]
    ]) expect(() => parseCaphubReleaseArgs(args)).toThrow();
  });

  it("dispatches only createCandidate or finalizeApproval", async () => {
    const createCandidate = vi.fn(async () => ({ status: "created" }));
    const finalizeApproval = vi.fn(async () => ({ status: "finalized" }));
    const load = async () => ({ createCandidate, finalizeApproval });
    await runCaphubRelease(["--compose", "--candidate", CANDIDATE_ID, "--decision", DECISION_ID], load);
    expect(createCandidate).toHaveBeenCalledWith({ candidateId: CANDIDATE_ID, approvalDecisionId: DECISION_ID });
    await runCaphubRelease(["--finalize", "--release", RELEASE_ID, "--decision", DECISION_ID], load);
    expect(finalizeApproval).toHaveBeenCalledWith({ releaseId: RELEASE_ID, approvalDecisionId: DECISION_ID });
  });
});
