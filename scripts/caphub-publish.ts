import type { ExportRuntime } from "../lib/caphub/exports/runtime";
import { pathToFileURL } from "node:url";
import { confirmationFor } from "../lib/caphub/registry/confirmations";
import { consoleIo, parseFlags, rejectForbiddenArgs, reportError, type CliIo } from "./caphub-cli";

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
      const approval = decisions.find((decision) => decision.action === "approve"
        && decision.review_kind === "deployment"
        && decision.subject_version === planRecord.version
        && decision.subject_digest === planRecord.payload_digest);
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
        planApprovalDecisionId: approval.id
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
