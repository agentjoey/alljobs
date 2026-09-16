import { describe, expect, it } from "vitest";
import { renderCodexPreview } from "../adapters/codex";
import { sourceDigestFor, type AdapterContract } from "../adapters/common";
import { digestCanonicalJson } from "../analysis/digest";
import { testCapabilityPackage } from "../packages/fixtures";
import type { CapabilityPackage, DeploymentPlan } from "../packages/types";
import type { ComposeDeploymentPlanInput, RegistryExportStore } from "../registry/contracts";
import { PostgresExportStoreError } from "../registry/postgres/exports";
import type { RegistryVersion, ReviewDecision } from "../registry/types";
import type { ValidatedTargetRoot } from "../projection/paths";
import { composeDeploymentPlan, DeploymentService, DeploymentServiceError } from "./plan";

const NOW = "2026-09-16T09:00:00.000Z";
const DIGEST = "a".repeat(64);
const RELEASE_ID = `rel_${"1".repeat(32)}`;

function planInput(overrides: Partial<DeploymentPlan> = {}): DeploymentPlan {
  return {
    schema_version: 1,
    action: "publish",
    target: "codex",
    target_alias: "codex-fixture",
    release: { record_id: RELEASE_ID, version: 1, digest: DIGEST },
    adapter: { name: "codex", version: "1.0.0", digest: DIGEST },
    preview_manifest_digest: DIGEST,
    preview_diff_digest: DIGEST,
    expected_current_pointer: null,
    target_preimage_digest: DIGEST,
    created_at: NOW,
    ...overrides
  };
}

describe("composeDeploymentPlan", () => {
  it("binds every exact-version field into a valid DeploymentPlanV1", () => {
    const composed = composeDeploymentPlan({ plan: planInput() });
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    expect(composed.plan.schema_version).toBe(1);
    expect(composed.plan.action).toBe("publish");
    expect(composed.plan.release.record_id).toBe(RELEASE_ID);
    expect(composed.planRecordId.startsWith("dpl_")).toBe(true);
  });

  it("requires a rollback to name the expected current pointer", () => {
    const composed = composeDeploymentPlan({
      plan: planInput({ action: "rollback" })
    });
    expect(composed.ok).toBe(false);
    if (!composed.ok) expect(composed.code).toBe("DEPLOYMENT_NOT_APPROVED");

    const withPointer = composeDeploymentPlan({
      plan: planInput({
        action: "rollback",
        expected_current_pointer: {
          deployment_id: `dep_${"2".repeat(32)}`,
          release_id: `rel_${"3".repeat(32)}`,
          release_version: 1,
          release_digest: DIGEST,
          pointer_digest: DIGEST
        }
      })
    });
    expect(withPointer.ok).toBe(true);
  });

  it("derives a deterministic plan identity from exact inputs", () => {
    const first = composeDeploymentPlan({ plan: planInput() });
    const second = composeDeploymentPlan({ plan: planInput() });
    const different = composeDeploymentPlan({ plan: planInput({ target_alias: "other" }) });
    expect(first.ok && second.ok && first.planRecordId === second.planRecordId).toBe(true);
    expect(first.ok && different.ok && first.planRecordId !== different.planRecordId).toBe(true);
  });

  it("rejects plans whose schema validation fails", () => {
    expect(composeDeploymentPlan({ plan: { ...planInput(), extra: true } as unknown as DeploymentPlan }).ok).toBe(false);
    expect(composeDeploymentPlan({ plan: { ...planInput(), target: "mcp" } as unknown as DeploymentPlan }).ok).toBe(false);
  });
});

describe("DeploymentService.createPlan", () => {
  const pkg: CapabilityPackage = testCapabilityPackage({ release_id: RELEASE_ID, dependencies: [] });
  const release: RegistryVersion = {
    record_id: RELEASE_ID,
    kind: "release",
    version: 1,
    schema_version: 1,
    payload: pkg,
    payload_digest: digestCanonicalJson(pkg),
    previous_version: null,
    created_at: NOW
  };
  const approval: ReviewDecision = {
    schema_version: 1,
    id: `dec_${"4".repeat(32)}`,
    request_id: `rev_${"5".repeat(32)}`,
    idempotency_key: "intent-release-finalize-1",
    expected_lock_version: 2,
    expected_subject_digest: release.payload_digest,
    action: "approve",
    confirmation: "APPROVE RELEASE 11111111",
    rationale: "Final.",
    disposition: undefined,
    review_kind: "release",
    subject_id: RELEASE_ID,
    subject_version: 1,
    subject_digest: release.payload_digest,
    actor: "human:owner",
    confirmation_digest: "b".repeat(64),
    original_approval_decision_id: null,
    revokes_decision_id: null,
    recorded_at: NOW
  };
  const root = { root: "/private/tmp/caphub-fixture-target", alias: "codex-fixture", sentinelPath: "/private/tmp/caphub-fixture-target/.caphub-target.json" } as ValidatedTargetRoot;

  interface FakeOptions {
    consumed?: boolean;
    adapterError?: boolean;
    composePlanResult?: "created" | "existing";
    composePlanError?: PostgresExportStoreError;
  }

  function makeService(options: FakeOptions = {}) {
    const composePlanCalls: ComposeDeploymentPlanInput[] = [];
    const codexContract: AdapterContract = {
      name: "codex",
      adapter_version: "1.0.0",
      logical_root: "$CODEX_HOME/skills",
      destination: (p) => `$CODEX_HOME/skills/${p.slug}/SKILL.md`,
      supported_kinds: ["skill", "reference"],
      allowed_permissions: ["read_file"],
      allowed_licenses: ["MIT"],
      allow_dependencies: false,
      max_description_bytes: 4096,
      max_triggers: 16,
      max_trigger_bytes: 120,
      skill_frontmatter_keys: ["description", "name"]
    };
    const exports: RegistryExportStore = {
      async composeRelease() {
        return "created";
      },
      async finalizeRelease() {
        return "finalized";
      },
      async composeDeploymentPlan(composeInput) {
        composePlanCalls.push(composeInput);
        if (options.composePlanError) throw options.composePlanError;
        return options.composePlanResult ?? "created";
      },
      async realizeDeployment() {
        return "created";
      }
    };
    const service = new DeploymentService({
      exports,
      records: {
        async getCurrent(recordId: string) {
          return recordId === RELEASE_ID ? release : null;
        }
      },
      reviews: {
        async listDecisionsForSubject(subjectId: string) {
          return subjectId === RELEASE_ID ? [approval] : [];
        },
        async getConsumption(decisionId: string) {
          return options.consumed === false || decisionId !== approval.id
            ? null
            : { consumer_id: RELEASE_ID };
        }
      },
      adapters: {
        codex: options.adapterError
          ? () => ({ ok: false as const, code: "ADAPTER_UNSUPPORTED" as const, diagnostics: ["blocked license"] })
          : (p: CapabilityPackage) => renderCodexPreview(p)
      },
      readTargetState: async () => ({ files: [], pointer: null }),
      clock: () => NOW
    });
    return { service, composePlanCalls, codexContract };
  }

  it("creates an exact plan record and deployment review for a finalized release", async () => {
    const { service, composePlanCalls, codexContract } = makeService();
    const adapterResult = renderCodexPreview(pkg);
    if (!adapterResult.ok) throw new Error("adapter fixture failed");

    const result = await service.createPlan({
      action: "publish",
      target: "codex",
      targetAlias: "codex-fixture",
      releaseId: RELEASE_ID,
      expectedReleaseDigest: release.payload_digest,
      root,
      expectedCurrentPointer: null
    });

    expect(result.status).toBe("created");
    expect(result.planRecord.kind).toBe("deployment_plan");
    expect(result.planRecord.record_id.startsWith("dpl_")).toBe(true);
    expect(result.plan.release).toEqual({ record_id: RELEASE_ID, version: 1, digest: release.payload_digest });
    expect(result.plan.adapter).toEqual({
      name: "codex",
      version: "1.0.0",
      digest: sourceDigestFor(codexContract)
    });
    expect(result.plan.preview_manifest_digest).toBe(adapterResult.result.output_manifest_digest);
    expect(result.plan.expected_current_pointer).toBeNull();

    expect(composePlanCalls).toHaveLength(1);
    const call = composePlanCalls[0];
    expect(call.plan.record_id).toBe(result.planRecord.record_id);
    expect(call.reviewRequest.review_kind).toBe("deployment");
    expect(call.reviewRequest.subject_id).toBe(result.planRecord.record_id);
    expect(call.lineage[0]).toMatchObject({
      from_kind: "release",
      relationship: "proposes",
      to_kind: "deployment_plan"
    });
  });

  it("refuses to plan without a finalized release approval", async () => {
    const unconsumed = makeService({ consumed: false });
    await expect(unconsumed.service.createPlan({
      action: "publish",
      target: "codex",
      targetAlias: "codex-fixture",
      releaseId: RELEASE_ID,
      expectedReleaseDigest: release.payload_digest,
      root,
      expectedCurrentPointer: null
    })).rejects.toMatchObject({ code: "DEPLOYMENT_NOT_APPROVED" });

    const { service } = makeService();
    await expect(service.createPlan({
      action: "publish",
      target: "codex",
      targetAlias: "codex-fixture",
      releaseId: `rel_${"0".repeat(32)}`,
      expectedReleaseDigest: release.payload_digest,
      root,
      expectedCurrentPointer: null
    })).rejects.toMatchObject({ code: "DEPLOYMENT_NOT_APPROVED" });
  });

  it("rejects stale release digests and pointer mismatches", async () => {
    const { service } = makeService();
    await expect(service.createPlan({
      action: "publish",
      target: "codex",
      targetAlias: "codex-fixture",
      releaseId: RELEASE_ID,
      expectedReleaseDigest: "c".repeat(64),
      root,
      expectedCurrentPointer: null
    })).rejects.toMatchObject({ code: "STALE_DEPLOYMENT" });

    await expect(service.createPlan({
      action: "rollback",
      target: "codex",
      targetAlias: "codex-fixture",
      releaseId: RELEASE_ID,
      expectedReleaseDigest: release.payload_digest,
      root,
      expectedCurrentPointer: {
        deployment_id: `dep_${"6".repeat(32)}`,
        release_id: `rel_${"7".repeat(32)}`,
        release_version: 1,
        release_digest: "d".repeat(64),
        pointer_digest: "e".repeat(64)
      }
    })).rejects.toMatchObject({ code: "STALE_DEPLOYMENT" });
  });

  it("rejects alias mismatches and unsupported adapter output", async () => {
    const { service } = makeService();
    await expect(service.createPlan({
      action: "publish",
      target: "codex",
      targetAlias: "codex-fixture",
      releaseId: RELEASE_ID,
      expectedReleaseDigest: release.payload_digest,
      root: { ...root, alias: "other-alias" },
      expectedCurrentPointer: null
    })).rejects.toMatchObject({ code: "UNSAFE_TARGET_ROOT" });

    const blocked = makeService({ adapterError: true });
    await expect(blocked.service.createPlan({
      action: "publish",
      target: "codex",
      targetAlias: "codex-fixture",
      releaseId: RELEASE_ID,
      expectedReleaseDigest: release.payload_digest,
      root,
      expectedCurrentPointer: null
    })).rejects.toMatchObject({ code: "ADAPTER_UNSUPPORTED" });
  });

  it("maps store failures and replays identical plans as existing", async () => {
    const conflicting = makeService({ composePlanError: new PostgresExportStoreError("REGISTRY_DIGEST_CONFLICT") });
    await expect(conflicting.service.createPlan({
      action: "publish",
      target: "codex",
      targetAlias: "codex-fixture",
      releaseId: RELEASE_ID,
      expectedReleaseDigest: release.payload_digest,
      root,
      expectedCurrentPointer: null
    })).rejects.toBeInstanceOf(DeploymentServiceError);

    const existing = makeService({ composePlanResult: "existing" });
    const result = await existing.service.createPlan({
      action: "publish",
      target: "codex",
      targetAlias: "codex-fixture",
      releaseId: RELEASE_ID,
      expectedReleaseDigest: release.payload_digest,
      root,
      expectedCurrentPointer: null
    });
    expect(result.status).toBe("existing");
  });
});
