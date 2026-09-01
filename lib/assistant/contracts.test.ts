import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assistantContextManifestSchema,
  assistantOutcomeSchema,
  assistantRequestIntentSchema,
  assistantRunRecordSchema,
  assistantStreamEventSchema,
  backlogProposalSchema,
  managementAnswerSchema,
  sourceAccessProposalSchema,
  taskDraftSchema
} from "./contracts";

const digest = "a".repeat(64);

describe("assistant request intent", () => {
  it("accepts a valid ask intent", () => {
    const parsed = assistantRequestIntentSchema.safeParse({
      intent: "ask",
      project_slug: "alljobs",
      question: "What blocks R2?",
      mode: "standard",
      selected_optional_source_ids: [],
      expected_manifest_digest: digest
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.intent === "ask") {
      expect(parsed.data.mode).toBe("standard");
    }
  });

  it("rejects browser-supplied workspace_path (unknown key)", () => {
    expect(assistantRequestIntentSchema.safeParse({
      intent: "ask",
      project_slug: "alljobs",
      question: "What blocks R2?",
      mode: "standard",
      selected_optional_source_ids: [],
      expected_manifest_digest: digest,
      workspace_path: "/tmp/escape"
    }).success).toBe(false);
  });

  it("rejects a nonempty browser history (no continuous conversation)", () => {
    expect(assistantRequestIntentSchema.safeParse({
      intent: "ask",
      project_slug: "alljobs",
      question: "What blocks R2?",
      mode: "standard",
      selected_optional_source_ids: [],
      expected_manifest_digest: digest,
      history: [{ role: "user", text: "previous question" }]
    }).success).toBe(false);
  });

  it("rejects an empty browser history field (unknown key)", () => {
    expect(assistantRequestIntentSchema.safeParse({
      intent: "ask",
      project_slug: "alljobs",
      question: "What blocks R2?",
      mode: "standard",
      selected_optional_source_ids: [],
      expected_manifest_digest: digest,
      history: []
    }).success).toBe(false);
  });

  it("rejects an invalid mode enumeration", () => {
    expect(assistantRequestIntentSchema.safeParse({
      intent: "ask",
      project_slug: "alljobs",
      question: "What blocks R2?",
      mode: "auto",
      selected_optional_source_ids: [],
      expected_manifest_digest: digest
    }).success).toBe(false);
  });

  it("rejects a question exceeding the character bound", () => {
    expect(assistantRequestIntentSchema.safeParse({
      intent: "ask",
      project_slug: "alljobs",
      question: "x".repeat(4001),
      mode: "standard",
      selected_optional_source_ids: [],
      expected_manifest_digest: digest
    }).success).toBe(false);
  });

  it("rejects a malformed manifest digest", () => {
    expect(assistantRequestIntentSchema.safeParse({
      intent: "ask",
      project_slug: "alljobs",
      question: "What blocks R2?",
      mode: "standard",
      selected_optional_source_ids: [],
      expected_manifest_digest: "not-a-digest"
    }).success).toBe(false);
  });

  it("rejects more than the maximum selected optional sources", () => {
    expect(assistantRequestIntentSchema.safeParse({
      intent: "ask",
      project_slug: "alljobs",
      question: "What blocks R2?",
      mode: "standard",
      selected_optional_source_ids: Array.from({ length: 9 }, (_, i) => `doc-${i}`),
      expected_manifest_digest: digest
    }).success).toBe(false);
  });

  it("rejects a source approval intent carrying a workspace path", () => {
    expect(assistantRequestIntentSchema.safeParse({
      intent: "inspect_source",
      project_slug: "alljobs",
      gate_id: randomUUID(),
      expected_manifest_digest: digest,
      workspace_path: "/tmp/escape"
    }).success).toBe(false);
  });

  it("accepts only a bounded task candidate and mode for a fresh draft request", () => {
    expect(assistantRequestIntentSchema.safeParse({ intent: "draft_task", project_slug: "alljobs", candidate: { id: "r1", title: "Verify citations", rationale: "Evidence is incomplete.", candidate_kind: "task" }, mode: "standard", expected_manifest_digest: digest }).success).toBe(true);
    expect(assistantRequestIntentSchema.safeParse({ intent: "draft_task", project_slug: "alljobs", candidate: { id: "r1", title: "Verify citations", rationale: "Evidence is incomplete.", candidate_kind: "backlog" }, mode: "standard", expected_manifest_digest: digest }).success).toBe(false);
  });

  it("requires the current bounded question for source follow-up intents without allowing history", () => {
    expect(assistantRequestIntentSchema.safeParse({
      intent: "inspect_source",
      project_slug: "alljobs",
      gate_id: randomUUID(),
      expected_manifest_digest: digest
    }).success).toBe(false);
    expect(assistantRequestIntentSchema.safeParse({
      intent: "answer_without_source",
      project_slug: "alljobs",
      gate_id: randomUUID(),
      question: "What blocks R2?",
      expected_manifest_digest: digest,
      history: []
    }).success).toBe(false);
  });
});

describe("assistant context manifest", () => {
  it("parses a valid manifest", () => {
    const parsed = assistantContextManifestSchema.safeParse({
      project_slug: "alljobs",
      source_mode: "local-working-tree",
      head_revision: "abc123",
      documents: [
        {
          source_id: "docs/ROADMAP.md",
          path: "docs/ROADMAP.md",
          digest,
          bytes: 1234,
          modified: false,
          optional: false,
          selected: true,
          read_at: "2026-09-01T00:00:00.000Z",
          issues: []
        }
      ],
      context_policy_version: 1,
      manifest_digest: digest
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown manifest fields", () => {
    expect(assistantContextManifestSchema.safeParse({
      project_slug: "alljobs",
      source_mode: "local-working-tree",
      documents: [],
      context_policy_version: 1,
      manifest_digest: digest,
      source_fragment_contents: ["secret"]
    }).success).toBe(false);
  });
});

describe("assistant outcome", () => {
  it("parses a management answer with facts and citations", () => {
    const parsed = assistantOutcomeSchema.safeParse({
      kind: "management_answer",
      direct_answer: "R2 is blocked by pending approval.",
      confirmed_facts: [
        { id: "f1", text: "The mockup is approved.", citation_source_ids: ["docs/ROADMAP.md"] }
      ],
      inferences: [
        { id: "i1", text: "Work can begin.", based_on_source_ids: ["docs/ROADMAP.md"] }
      ],
      unknowns: [],
      questions: [],
      recommendations: [
        { id: "r1", title: "Start Task 1", rationale: "Contracts first", candidate_kind: "task" }
      ],
      citations: [
        { source_id: "docs/ROADMAP.md", label: "Roadmap" }
      ]
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a management answer fact citing no source", () => {
    expect(managementAnswerSchema.safeParse({
      kind: "management_answer",
      direct_answer: "ok",
      confirmed_facts: [{ id: "f1", text: "fact", citation_source_ids: [] }],
      inferences: [],
      unknowns: [],
      questions: [],
      recommendations: [],
      citations: []
    }).success).toBe(false);
  });

  it("parses a source access proposal", () => {
    const parsed = sourceAccessProposalSchema.safeParse({
      kind: "source_access_proposal",
      purpose: "Inspect the parser entry point",
      unanswered_question: "How does the parser reject invalid input?",
      requested_capabilities: ["list_project_files", "read_project_files"],
      gate_id: "server-bound-gate",
      max_files: 6,
      max_bytes: 192 * 1024,
      max_tool_calls: 4,
      expected_facts: ["The parser validates input"],
      manifest_digest: digest,
      expires_at: "2026-09-01T00:10:00.000Z"
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a source access proposal without a server-bound gate id", () => {
    expect(sourceAccessProposalSchema.safeParse({
      kind: "source_access_proposal",
      purpose: "Inspect",
      unanswered_question: "Why?",
      requested_capabilities: ["list_project_files"],
      max_files: 1,
      max_bytes: 1,
      max_tool_calls: 1,
      expected_facts: [],
      manifest_digest: digest,
      expires_at: "2026-09-01T00:10:00.000Z"
    }).success).toBe(false);
  });

  it("rejects a source access proposal with an empty capability set", () => {
    expect(sourceAccessProposalSchema.safeParse({
      kind: "source_access_proposal",
      purpose: "Inspect",
      unanswered_question: "Why?",
      requested_capabilities: [],
      max_files: 6,
      max_bytes: 1024,
      max_tool_calls: 4,
      expected_facts: [],
      manifest_digest: digest,
      expires_at: "2026-09-01T00:10:00.000Z"
    }).success).toBe(false);
  });
});

describe("task draft and backlog proposal", () => {
  it("parses a task draft", () => {
    const parsed = taskDraftSchema.safeParse({
      title: "Verify R2 source citations",
      status: "todo",
      work_mode: "implementation",
      phase: "phase-1",
      priority: "P1",
      evidence: ["The mockup is approved"],
      assumptions: ["Local source is canonical"],
      citation_source_ids: ["docs/ROADMAP.md"],
      manifest_digest: digest
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a task draft with an unknown field", () => {
    expect(taskDraftSchema.safeParse({
      title: "Verify",
      status: "todo",
      evidence: [],
      assumptions: [],
      citation_source_ids: ["docs/ROADMAP.md"],
      manifest_digest: digest,
      injected_instruction: "rm -rf /"
    }).success).toBe(false);
  });

  it("parses a backlog proposal", () => {
    const parsed = backlogProposalSchema.safeParse({
      problem: "R2 contracts are undefined",
      desired_outcome: "A strict contract graph",
      suggested_title: "Define R2 contracts",
      suggested_priority: "P0",
      suggested_dependencies: [],
      suggested_work_mode: "implementation",
      done_when: "Contracts validate strict rejection",
      evidence: [],
      assumptions: [],
      unknowns: [],
      questions: [],
      citation_source_ids: ["docs/ROADMAP.md"],
      manifest_digest: digest,
      model: "MiniMax-M3",
      mode: "standard",
      generated_at: "2026-09-01T00:00:00.000Z",
      proposal_digest: digest
    });
    expect(parsed.success).toBe(true);
  });
});

describe("assistant run record", () => {
  const baseRecord = {
    run_id: randomUUID(),
    project: "alljobs",
    model: "MiniMax-M3",
    mode: "standard",
    status: "complete",
    duration_ms: 100,
    manifest_digest: digest
  };

  it("parses a metadata-only run record", () => {
    expect(assistantRunRecordSchema.safeParse(baseRecord).success).toBe(true);
  });

  it("rejects a question field", () => {
    expect(assistantRunRecordSchema.safeParse({ ...baseRecord, question: "must not persist" }).success).toBe(false);
  });

  it("rejects an answer field", () => {
    expect(assistantRunRecordSchema.safeParse({ ...baseRecord, answer: "must not persist" }).success).toBe(false);
  });

  it("rejects a reasoning field", () => {
    expect(assistantRunRecordSchema.safeParse({ ...baseRecord, reasoning: "must not persist" }).success).toBe(false);
  });

  it("rejects a source fragment field", () => {
    expect(assistantRunRecordSchema.safeParse({ ...baseRecord, fragments: [{ content: "secret" }] }).success).toBe(false);
  });

  it("rejects a draft field", () => {
    expect(assistantRunRecordSchema.safeParse({ ...baseRecord, draft: { title: "secret" } }).success).toBe(false);
  });

  it("rejects a proposal body field", () => {
    expect(assistantRunRecordSchema.safeParse({ ...baseRecord, proposal: { problem: "secret" } }).success).toBe(false);
  });

  it("rejects a credential field", () => {
    expect(assistantRunRecordSchema.safeParse({ ...baseRecord, api_key: "sk-secret" }).success).toBe(false);
  });
});

describe("assistant stream event", () => {
  it("parses run status, complete, and error events", () => {
    expect(assistantStreamEventSchema.safeParse({ type: "run_status", stage: "preparing" }).success).toBe(true);
    expect(assistantStreamEventSchema.safeParse({
      type: "assistant_complete",
      stale: false,
      outcome: {
        kind: "management_answer",
        direct_answer: "ok",
        confirmed_facts: [],
        inferences: [],
        unknowns: [],
        questions: [],
        recommendations: [],
        citations: []
      }
    }).success).toBe(true);
    expect(assistantStreamEventSchema.safeParse({
      type: "assistant_error",
      code: "AUTHENTICATION",
      message: "missing key"
    }).success).toBe(true);
  });

  it("rejects an unknown stream event type", () => {
    expect(assistantStreamEventSchema.safeParse({ type: "raw_reasoning" }).success).toBe(false);
  });
});
