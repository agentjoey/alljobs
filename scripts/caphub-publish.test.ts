import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { renderCodexPreview } from "../lib/caphub/adapters/codex";
import { digestCanonicalJson } from "../lib/caphub/analysis/digest";
import { testCapabilityPackage } from "../lib/caphub/packages/fixtures";
import type { DeploymentPlan } from "../lib/caphub/packages/types";
import type { RegistryVersion } from "../lib/caphub/registry/types";
import { ExportRuntimeError } from "../lib/caphub/exports/runtime";
import { publishToTarget } from "../lib/caphub/deployments/publisher";
import { derivePlanRecordId } from "../lib/caphub/deployments/plan";
import { validateTargetRoot, writeTargetSentinel } from "../lib/caphub/projection/paths";
import { createPublishAuthority } from "./caphub-publish";

const NOW = "2026-09-16T09:00:00.000Z";
const DIGEST = "a".repeat(64);

const tempDirs: string[] = [];

afterAll(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

function plan(overrides: Partial<DeploymentPlan> = {}): DeploymentPlan {
  const pkg = testCapabilityPackage({ release_id: `rel_${"1".repeat(32)}`, dependencies: [] });
  const rendered = renderCodexPreview(pkg);
  if (!rendered.ok) throw new Error("fixture");
  return {
    schema_version: 1,
    action: "publish",
    target: "codex",
    target_alias: "codex-primary",
    release: { record_id: pkg.release_id, version: 1, digest: pkg.digest },
    adapter: { name: "codex", version: "1.0.0", digest: rendered.result.source_digest },
    preview_manifest_digest: rendered.result.output_manifest_digest,
    preview_diff_digest: DIGEST,
    expected_current_pointer: null,
    target_preimage_digest: digestCanonicalJson({ schema_version: 1, pointer: null, files: [] }),
    created_at: NOW,
    ...overrides
  };
}

function releaseRecordFor(target: DeploymentPlan): RegistryVersion {
  return {
    record_id: target.release.record_id,
    kind: "release",
    version: target.release.version,
    schema_version: 1,
    payload: {},
    payload_digest: target.release.digest,
    previous_version: null,
    created_at: NOW
  };
}

function makeDeps(target: DeploymentPlan, overrides: Record<string, unknown> = {}) {
  const releaseDecisionId = `dec_${"5".repeat(32)}`;
  const planApprovalDecisionId = `dec_${"6".repeat(32)}`;
  const deploymentRecordId = `dep_${"7".repeat(32)}`;
  const planRecordId = derivePlanRecordId(target);
  const planDigest = digestCanonicalJson(target);
  return {
    releaseRecord: releaseRecordFor(target),
    planApprovalDecisionId,
    deploymentRecordId,
    planRecord: { record_id: planRecordId, version: 1, payload_digest: planDigest },
    reviews: {
      async listDecisionsForSubject() {
        return [{
          id: releaseDecisionId,
          action: "approve",
          review_kind: "release",
          subject_id: target.release.record_id,
          subject_version: target.release.version,
          subject_digest: target.release.digest
        }] as never;
      },
      async getDecision(decisionId: string) {
        if (decisionId !== planApprovalDecisionId) return null;
        return {
          id: planApprovalDecisionId,
          request_id: `rev_${"8".repeat(32)}`,
          action: "approve",
          review_kind: "deployment",
          subject_id: planRecordId,
          subject_version: 1,
          subject_digest: planDigest
        } as never;
      },
      async getRequest() {
        return {
          state: "APPROVED",
          review_kind: "deployment",
          subject_id: planRecordId,
          subject_version: 1,
          subject_digest: planDigest
        } as never;
      },
      async getConsumption(decisionId: string) {
        return decisionId === releaseDecisionId ? { consumer_id: target.release.record_id } : null;
      }
    },
    targetRootDir: "",
    renderAdapter: () => renderCodexPreview(testCapabilityPackage({ release_id: target.release.record_id, dependencies: [] })),
    assertEnabled: () => undefined,
    ...overrides
  };
}

describe("createPublishAuthority (acceptance fix 2)", () => {
  it("passes when every reproduction matches", async () => {
    const target = plan({ preview_diff_digest: "" } as never);
    const pkg = testCapabilityPackage({ release_id: target.release.record_id, dependencies: [] });
    const rendered = renderCodexPreview(pkg);
    if (!rendered.ok) throw new Error("fixture");
    const rootDir = await realpath(await mkdtemp(join(tmpdir(), "caphub-auth-ok-")));
    tempDirs.push(rootDir);
    const { diffPackageFiles } = await import("../lib/caphub/packages/diff");
    const diff = diffPackageFiles({ baseFiles: null, nextFiles: rendered.result.files, redactRoots: [rootDir] });
    const valid = plan({ preview_diff_digest: diff.digest });
    const authority = createPublishAuthority(makeDeps(valid, { targetRootDir: rootDir }) as never);
    await expect(authority(valid, { manifestDigest: valid.preview_manifest_digest, preimageDigest: null })).resolves.toBeUndefined();
  });

  it("fails closed when the preview diff no longer reproduces", async () => {
    const target = plan({ preview_diff_digest: "b".repeat(64) });
    const rootDir = await realpath(await mkdtemp(join(tmpdir(), "caphub-auth-diff-")));
    tempDirs.push(rootDir);
    const authority = createPublishAuthority(makeDeps(target, { targetRootDir: rootDir }) as never);
    await expect(authority(target, { manifestDigest: target.preview_manifest_digest, preimageDigest: null }))
      .rejects.toMatchObject({ code: "STALE_DEPLOYMENT" });
  });

  it("fails closed when the adapter identity or version changed", async () => {
    const target = plan({ preview_diff_digest: "b".repeat(64) });
    const rootDir = await realpath(await mkdtemp(join(tmpdir(), "caphub-auth-adapter-")));
    tempDirs.push(rootDir);
    const deps = makeDeps(target, {
      targetRootDir: rootDir,
      renderAdapter: () => {
        const base = renderCodexPreview(testCapabilityPackage({ release_id: target.release.record_id, dependencies: [] }));
        if (!base.ok) return base;
        return {
          ok: true as const,
          result: { ...base.result, adapter_version: "9.9.9-changed" }
        };
      }
    });
    const authority = createPublishAuthority(deps as never);
    await expect(authority(target, { manifestDigest: target.preview_manifest_digest, preimageDigest: null }))
      .rejects.toMatchObject({ code: "STALE_DEPLOYMENT" });
  });

  it("fails closed when the export layer is disabled", async () => {
    const target = plan();
    const authority = createPublishAuthority(makeDeps(target, {
      assertEnabled: () => {
        throw new ExportRuntimeError("P4_EXPORT_DISABLED");
      }
    }) as never);
    await expect(authority(target, { manifestDigest: target.preview_manifest_digest, preimageDigest: null }))
      .rejects.toMatchObject({ code: "P4_EXPORT_DISABLED" });
  });

  it("rejects a deployment approval consumed by another deployment before any target write", async () => {
    const rootDir = await realpath(await mkdtemp(join(tmpdir(), "caphub-auth-consumed-")));
    tempDirs.push(rootDir);
    await writeTargetSentinel(rootDir, "codex-primary");
    const root = await validateTargetRoot({ root: rootDir, alias: "codex-primary" });
    const draft = plan({ preview_diff_digest: "" } as never);
    const pkg = testCapabilityPackage({ release_id: draft.release.record_id, dependencies: [] });
    const rendered = renderCodexPreview(pkg);
    if (!rendered.ok) throw new Error("fixture");
    const { diffPackageFiles } = await import("../lib/caphub/packages/diff");
    const valid = plan({ preview_diff_digest: diffPackageFiles({ baseFiles: null, nextFiles: rendered.result.files }).digest });
    const base = makeDeps(valid, { targetRootDir: rootDir });
    const authority = createPublishAuthority({
      ...base,
      reviews: {
        ...base.reviews,
        getConsumption: async (decisionId: string) => decisionId === base.planApprovalDecisionId
          ? { consumer_id: `dep_${"f".repeat(32)}` }
          : { consumer_id: valid.release.record_id }
      }
    } as never);
    const markerPath = join(rootDir, "versions", valid.release.record_id, "1", valid.preview_manifest_digest, ".caphub-version.json");

    await expect(publishToTarget({
      root,
      plan: valid,
      files: rendered.result.files,
      exports: {
        composeRelease: async () => "created" as const,
        finalizeRelease: async () => "finalized" as const,
        composeDeploymentPlan: async () => "created" as const,
        realizeDeployment: async () => "created" as const
      },
      deploymentRecordId: base.deploymentRecordId,
      planApprovalDecisionId: base.planApprovalDecisionId,
      assertAuthority: authority,
      clock: () => NOW
    })).rejects.toMatchObject({ code: "DECISION_ALREADY_CONSUMED" });
    await expect(readFile(markerPath, "utf8")).rejects.toThrow();
  });

  it("rejects a deployment decision that is not bound to the exact plan digest", async () => {
    const rootDir = await realpath(await mkdtemp(join(tmpdir(), "caphub-auth-plan-digest-")));
    tempDirs.push(rootDir);
    const draft = plan({ preview_diff_digest: "" } as never);
    const pkg = testCapabilityPackage({ release_id: draft.release.record_id, dependencies: [] });
    const rendered = renderCodexPreview(pkg);
    if (!rendered.ok) throw new Error("fixture");
    const { diffPackageFiles } = await import("../lib/caphub/packages/diff");
    const valid = plan({ preview_diff_digest: diffPackageFiles({ baseFiles: null, nextFiles: rendered.result.files }).digest });
    const base = makeDeps(valid, { targetRootDir: rootDir });
    const authority = createPublishAuthority({
      ...base,
      reviews: {
        ...base.reviews,
        getDecision: async () => ({
          id: base.planApprovalDecisionId,
          request_id: `rev_${"8".repeat(32)}`,
          action: "approve",
          review_kind: "deployment",
          subject_id: base.planRecord.record_id,
          subject_version: 1,
          subject_digest: "f".repeat(64)
        }) as never
      }
    } as never);
    await expect(authority(valid, { manifestDigest: valid.preview_manifest_digest, preimageDigest: null }))
      .rejects.toMatchObject({ code: "STALE_DEPLOYMENT" });
  });

  it("rejects apply evidence that is not bound to the approved manifest and preimage", async () => {
    const rootDir = await realpath(await mkdtemp(join(tmpdir(), "caphub-auth-evidence-")));
    tempDirs.push(rootDir);
    const draft = plan({ preview_diff_digest: "" } as never);
    const pkg = testCapabilityPackage({ release_id: draft.release.record_id, dependencies: [] });
    const rendered = renderCodexPreview(pkg);
    if (!rendered.ok) throw new Error("fixture");
    const { diffPackageFiles } = await import("../lib/caphub/packages/diff");
    const valid = plan({ preview_diff_digest: diffPackageFiles({ baseFiles: null, nextFiles: rendered.result.files }).digest });
    const authority = createPublishAuthority(makeDeps(valid, { targetRootDir: rootDir }) as never);

    await expect(authority(valid, { manifestDigest: "f".repeat(64), preimageDigest: null }))
      .rejects.toMatchObject({ code: "STALE_DEPLOYMENT" });
    await expect(authority(valid, { manifestDigest: valid.preview_manifest_digest, preimageDigest: "e".repeat(64) }))
      .rejects.toMatchObject({ code: "STALE_DEPLOYMENT" });
  });

  it("does not treat a finalized approval for another release version as current authority", async () => {
    const rootDir = await realpath(await mkdtemp(join(tmpdir(), "caphub-auth-release-version-")));
    tempDirs.push(rootDir);
    const draft = plan({ preview_diff_digest: "" } as never);
    const pkg = testCapabilityPackage({ release_id: draft.release.record_id, dependencies: [] });
    const rendered = renderCodexPreview(pkg);
    if (!rendered.ok) throw new Error("fixture");
    const { diffPackageFiles } = await import("../lib/caphub/packages/diff");
    const valid = plan({ preview_diff_digest: diffPackageFiles({ baseFiles: null, nextFiles: rendered.result.files }).digest });
    const base = makeDeps(valid, { targetRootDir: rootDir });
    const authority = createPublishAuthority({
      ...base,
      reviews: {
        ...base.reviews,
        listDecisionsForSubject: async () => [{
          id: `dec_${"5".repeat(32)}`,
          action: "approve",
          review_kind: "release",
          subject_id: valid.release.record_id,
          subject_version: valid.release.version + 1,
          subject_digest: valid.release.digest
        }] as never
      }
    } as never);
    await expect(authority(valid, { manifestDigest: valid.preview_manifest_digest, preimageDigest: null }))
      .rejects.toMatchObject({ code: "DEPLOYMENT_NOT_APPROVED" });
  });

  it("reproduces the approved diff from the planned preimage during an idempotent replay", async () => {
    const rootDir = await realpath(await mkdtemp(join(tmpdir(), "caphub-auth-replay-")));
    tempDirs.push(rootDir);
    await writeTargetSentinel(rootDir, "codex-primary");
    const root = await validateTargetRoot({ root: rootDir, alias: "codex-primary" });
    const target = plan({ preview_diff_digest: "" } as never);
    const pkg = testCapabilityPackage({ release_id: target.release.record_id, dependencies: [] });
    const rendered = renderCodexPreview(pkg);
    if (!rendered.ok) throw new Error("fixture");
    const { diffPackageFiles } = await import("../lib/caphub/packages/diff");
    const approvedDiff = diffPackageFiles({ baseFiles: null, nextFiles: rendered.result.files, redactRoots: [rootDir] });
    const approvedPlan = plan({ preview_diff_digest: approvedDiff.digest });
    const deps = makeDeps(approvedPlan, { targetRootDir: rootDir });
    const authority = createPublishAuthority(deps as never);
    let realizeCalls = 0;
    const input = {
      root,
      plan: approvedPlan,
      files: rendered.result.files,
      exports: {
        composeRelease: async () => "created" as const,
        finalizeRelease: async () => "finalized" as const,
        composeDeploymentPlan: async () => "created" as const,
        realizeDeployment: async () => {
          realizeCalls += 1;
          return "created" as const;
        }
      },
      deploymentRecordId: deps.deploymentRecordId,
      planApprovalDecisionId: deps.planApprovalDecisionId,
      assertAuthority: authority,
      clock: () => NOW
    };

    const first = await publishToTarget(input);
    await expect(publishToTarget(input)).resolves.toEqual(first);
    expect(realizeCalls).toBe(1);
  });
});
