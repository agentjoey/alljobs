import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { renderCodexPreview } from "../lib/caphub/adapters/codex";
import { digestCanonicalJson } from "../lib/caphub/analysis/digest";
import { testCapabilityPackage } from "../lib/caphub/packages/fixtures";
import type { DeploymentPlan } from "../lib/caphub/packages/types";
import type { RegistryVersion } from "../lib/caphub/registry/types";
import { ExportRuntimeError } from "../lib/caphub/exports/runtime";
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
  return {
    releaseRecord: releaseRecordFor(target),
    reviews: {
      async listDecisionsForSubject() {
        return [{ action: "approve", review_kind: "release" }] as never;
      },
      async getConsumption() {
        return { consumer_id: target.release.record_id };
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
});
