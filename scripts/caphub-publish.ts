import type { ExportRuntime } from "../lib/caphub/exports/runtime";
import type { RegistryVersion } from "../lib/caphub/registry/types";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { confirmationFor } from "../lib/caphub/registry/confirmations";
import { consoleIo, parseFlags, rejectForbiddenArgs, reportError, type CliIo } from "./caphub-cli";

export interface PublishAuthorityDeps {
  releaseRecord: RegistryVersion;
  reviews: {
    listDecisionsForSubject(subjectId: string): Promise<import("../lib/caphub/registry/types").ReviewDecision[]>;
    getConsumption(decisionId: string): Promise<{ consumer_id: string } | null>;
  };
  targetRootDir: string;
  renderAdapter: () => import("../lib/caphub/adapters/contracts").AdapterRenderResult;
  assertEnabled: (target: "codex" | "claude" | "hermes") => void;
}

function authorityError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** Spec §9.2 apply-time authority revalidation, wired for the publish CLI.
 * Every reproduction failure throws a coded P4 error before any side effect. */
export function createPublishAuthority(deps: PublishAuthorityDeps) {
  return async (
    expected: import("../lib/caphub/packages/types").DeploymentPlan,
    _evidence?: import("../lib/caphub/deployments/publisher").ApplyEvidence
  ): Promise<void> => {
    deps.assertEnabled(expected.target as "codex" | "claude" | "hermes");
    if (deps.releaseRecord.version !== expected.release.version
      || deps.releaseRecord.payload_digest !== expected.release.digest) {
      throw authorityError("STALE_DEPLOYMENT", "release record no longer matches the plan");
    }
    const decisions = await deps.reviews.listDecisionsForSubject(expected.release.record_id);
    let finalized = false;
    for (const candidate of decisions.filter((d) => d.action === "approve" && d.review_kind === "release")) {
      const consumed = await deps.reviews.getConsumption(candidate.id);
      if (consumed?.consumer_id === expected.release.record_id) finalized = true;
    }
    if (!finalized) {
      throw authorityError("DEPLOYMENT_NOT_APPROVED", "release approval is not finalized");
    }
    const rendered = deps.renderAdapter();
    if (!rendered.ok) {
      throw authorityError("ADAPTER_UNSUPPORTED", rendered.diagnostics.join("; "));
    }
    if (rendered.result.adapter !== expected.adapter.name
      || rendered.result.adapter_version !== expected.adapter.version
      || rendered.result.source_digest !== expected.adapter.digest) {
      throw authorityError("STALE_DEPLOYMENT", "adapter identity, version, or source digest no longer matches the plan");
    }
    if (rendered.result.output_manifest_digest !== expected.preview_manifest_digest) {
      throw authorityError("STALE_DEPLOYMENT", "adapter output manifest no longer matches the plan");
    }
    const { readActiveAdapterFiles } = await import("./caphub-export");
    const { diffPackageFiles } = await import("../lib/caphub/packages/diff");
    const snapshot = await readActiveAdapterFiles(deps.targetRootDir);
    const diff = diffPackageFiles({
      baseFiles: snapshot.map((file) => ({
        path: file.path,
        media_type: "text/markdown" as const,
        content: file.content,
        sha256: createHash("sha256").update(file.content, "utf8").digest("hex"),
        bytes: Buffer.byteLength(file.content, "utf8")
      })),
      nextFiles: rendered.result.files,
      redactRoots: [deps.targetRootDir]
    });
    if (diff.digest !== expected.preview_diff_digest) {
      throw authorityError("STALE_DEPLOYMENT", "preview diff no longer reproduces the approved digest");
    }
  };
}

export interface PublishCliDeps {
  loadRuntime(): ExportRuntime;
  publishPlan(input: { planId: string; confirmation: string }): Promise<{ pointer: unknown }>;
}

export async function caphubPublishMain(
  argv: string[],
  deps: PublishCliDeps,
  io: CliIo = consoleIo
): Promise<number> {
  try {
    const flags = parseFlags(argv);
    rejectForbiddenArgs(flags, ["root", "path", "target-root", "dry-run"]);
    const planId = flags.get("plan");
    if (typeof planId !== "string" || !/^dpl_[a-f0-9]{32}$/.test(planId)) {
      throw new Error("missing or invalid --plan <dpl_record-id>");
    }
    const confirmation = flags.get("confirm");
    if (typeof confirmation !== "string" || confirmation.length === 0) {
      throw new Error("missing --confirm with the exact approved confirmation phrase");
    }

    const runtime = deps.loadRuntime();
    runtime.assertEnabled();
    const result = await deps.publishPlan({ planId, confirmation });
    io.log(JSON.stringify({ schema_version: 1, published: true, pointer: result.pointer }, null, 2));
    return 0;
  } catch (error) {
    return reportError(io, error);
  }
}

async function loadPublishDeps(): Promise<PublishCliDeps> {
  const { loadControlHostExportContext } = await import("./caphub-cli");
  const { loadControlHostRegistryRuntime } = await import("../lib/caphub/registry/runtime");
  const { loadControlHostConfig } = await import("../lib/planning/config");
  const { PostgresRegistryRecordStore } = await import("../lib/caphub/registry/postgres/records");
  const { PostgresReviewStore } = await import("../lib/caphub/registry/postgres/reviews");
  const { PostgresExportStore } = await import("../lib/caphub/registry/postgres/exports");
  const { deploymentPlanSchema, capabilityPackageSchema } = await import("../lib/caphub/packages/schemas");
  const { validateTargetRoot } = await import("../lib/caphub/projection/paths");
  const { publishToTarget } = await import("../lib/caphub/deployments/publisher");
  const { digestCanonicalJson } = await import("../lib/caphub/analysis/digest");
  const { renderCodexPreview } = await import("../lib/caphub/adapters/codex");
  const { renderClaudePreview } = await import("../lib/caphub/adapters/claude");
  const { renderHermesPreview } = await import("../lib/caphub/adapters/hermes");

  const context = await loadControlHostExportContext();
  const resolved = loadControlHostConfig();
  const registry = await loadControlHostRegistryRuntime({ resolved });
  const records = new PostgresRegistryRecordStore(registry.pool, {
    release: capabilityPackageSchema,
    deployment_plan: deploymentPlanSchema
  });
  const reviews = new PostgresReviewStore(registry.pool);

  return {
    loadRuntime: () => context.runtime,
    publishPlan: async ({ planId, confirmation }) => {
      const planRecord = await records.getCurrent(planId);
      if (!planRecord || planRecord.kind !== "deployment_plan") {
        throw new Error(`deployment plan ${planId} not found`);
      }
      const plan = deploymentPlanSchema.parse(planRecord.payload);
      const decisions = await reviews.listDecisionsForSubject(planId);
      const matching = decisions.filter((decision) => decision.action === "approve"
        && decision.review_kind === "deployment"
        && decision.subject_version === planRecord.version
        && decision.subject_digest === planRecord.payload_digest);
      const approval = matching.at(-1) ?? null;
      if (!approval) throw new Error("no approved deployment decision for this exact plan");
      const request = await reviews.getRequest(approval.request_id);
      const expected = request?.approve_confirmation
        ?? confirmationFor({ review_kind: "deployment", subject_id: planId }, "approve");
      if (confirmation !== expected) {
        throw new Error("confirmation does not match the exact approved phrase");
      }
      if (plan.target === "obsidian") {
        throw new Error("obsidian publish applies through the projection engine gate, not this CLI");
      }
      const alias = context.runtime.publicView().targets[plan.target].alias ?? plan.target;
      const root = await validateTargetRoot({ root: context.runtime.resolveTargetRoot(plan.target), alias });
      const releaseRecord = await records.getCurrent(plan.release.record_id);
      if (!releaseRecord) throw new Error("release record missing");
      const pkg = capabilityPackageSchema.parse(releaseRecord.payload);
      const adapter = { codex: renderCodexPreview, claude: renderClaudePreview, hermes: renderHermesPreview }[plan.target];
      const rendered = adapter(pkg);
      if (!rendered.ok) throw new Error(rendered.diagnostics.join("; "));
      const deploymentId = `dep_${digestCanonicalJson({ schema_version: 1, plan: digestCanonicalJson(plan) }).slice(0, 32)}`;
      return publishToTarget({
        root,
        plan,
        files: rendered.result.files,
        exports: new PostgresExportStore(registry.pool),
        deploymentRecordId: deploymentId,
        planApprovalDecisionId: approval.id,
        assertAuthority: createPublishAuthority({
          releaseRecord,
          reviews,
          targetRootDir: root.root,
          renderAdapter: () => rendered,
          assertEnabled: (target) => context.runtime.assertEnabled(target)
        })
      });
    }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  caphubPublishMain(process.argv.slice(2), await loadPublishDeps()).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Caphub publish failed"}\n`);
    process.exitCode = 1;
  });
}
