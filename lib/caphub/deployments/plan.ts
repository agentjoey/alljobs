import { digestCanonicalJson } from "../analysis/digest";
import type { AdapterRenderResult } from "../adapters/contracts";
import { capabilityPackageSchema } from "../packages/schemas";
import { deploymentPlanSchema } from "../packages/schemas";
import type { CapabilityPackage, DeploymentPlan, DeploymentTarget, P4ErrorCode } from "../packages/types";
import { diffPackageFiles } from "../packages/diff";
import type { PackageFile } from "../packages/types";
import { confirmationFor } from "../registry/confirmations";
import type { RegistryExportStore, RegistryRecordStore, ReviewStore } from "../registry/contracts";
import { PostgresExportStoreError } from "../registry/postgres/exports";
import type { RegistryLineageEdge, RegistrySafeErrorCode, RegistryVersion, ReviewRequest } from "../registry/types";
import type { ValidatedTargetRoot } from "../projection/paths";

export type DeploymentServiceErrorCode = P4ErrorCode | RegistrySafeErrorCode | "INVALID_REGISTRY_RECORD";

export class DeploymentServiceError extends Error {
  constructor(
    readonly code: DeploymentServiceErrorCode,
    readonly diagnostics: string[] = []
  ) {
    super(diagnostics.join("; ") || code);
    this.name = "DeploymentServiceError";
  }
}

export const PROJECTION_ADAPTER_DIGEST = digestCanonicalJson({
  schema_version: 1,
  adapter: "obsidian",
  version: "1.0.0",
  assumptions: {
    managed_region: "caphub:managed",
    human_region: "caphub:human",
    frontmatter_keys: [
      "caphub_schema",
      "caphub_record_id",
      "caphub_record_version",
      "caphub_record_digest",
      "caphub_managed_digest"
    ],
    human_headings: ["我的判断", "使用经验", "可以组合的能力", "后续想法"]
  }
});

export interface CurrentPointer {
  deployment_id: string;
  release_id: string;
  release_version: number;
  release_digest: string;
  pointer_digest: string;
}

export interface TargetState {
  files: PackageFile[];
  pointer: CurrentPointer | null;
}

export type ComposePlanResult =
  | { ok: true; plan: DeploymentPlan; planRecordId: string }
  | { ok: false; code: DeploymentServiceErrorCode; diagnostics: string[] };

export function derivePlanRecordId(plan: DeploymentPlan): string {
  return `dpl_${digestCanonicalJson({
    schema_version: 1,
    action: plan.action,
    target: plan.target,
    target_alias: plan.target_alias,
    release: plan.release,
    adapter: plan.adapter ?? null
  }).slice(0, 32)}`;
}

export function composeDeploymentPlan(input: { plan: DeploymentPlan }): ComposePlanResult {
  const parsed = deploymentPlanSchema.safeParse(input.plan);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_PACKAGE",
      diagnostics: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    };
  }
  const plan = parsed.data;
  if (plan.action === "rollback" && plan.expected_current_pointer === null) {
    return {
      ok: false,
      code: "DEPLOYMENT_NOT_APPROVED",
      diagnostics: ["rollback plans must name the exact expected current pointer"]
    };
  }
  return { ok: true, plan, planRecordId: derivePlanRecordId(plan) };
}

export interface DeploymentServiceDependencies {
  exports: RegistryExportStore;
  records: Pick<RegistryRecordStore, "getCurrent">;
  reviews: Pick<ReviewStore, "listDecisionsForSubject" | "getConsumption">;
  adapters: Partial<Record<Exclude<DeploymentTarget, "obsidian">, (pkg: CapabilityPackage) => AdapterRenderResult>>;
  readTargetState: (root: ValidatedTargetRoot) => Promise<TargetState>;
  clock?: () => string;
}

export interface CreateDeploymentPlanInput {
  action: "publish" | "rollback";
  target: DeploymentTarget;
  targetAlias: string;
  releaseId: string;
  expectedReleaseDigest: string;
  root: ValidatedTargetRoot;
  expectedCurrentPointer: CurrentPointer | null;
  /** Required for the obsidian target, where previews come from the projection engine. */
  obsidianPreviewDigests?: { manifestDigest: string; diffDigest: string };
}

function samePointer(left: CurrentPointer | null, right: CurrentPointer | null): boolean {
  if (left === null || right === null) return left === right;
  return left.deployment_id === right.deployment_id
    && left.release_id === right.release_id
    && left.release_version === right.release_version
    && left.release_digest === right.release_digest
    && left.pointer_digest === right.pointer_digest;
}

function mapExportError(error: unknown): DeploymentServiceError {
  if (error instanceof PostgresExportStoreError) {
    return new DeploymentServiceError(error.code as DeploymentServiceErrorCode);
  }
  if (error instanceof DeploymentServiceError) return error;
  throw error;
}

export class DeploymentService {
  private readonly clock: () => string;

  constructor(private readonly deps: DeploymentServiceDependencies) {
    this.clock = deps.clock ?? (() => new Date().toISOString());
  }

  async createPlan(input: CreateDeploymentPlanInput): Promise<{
    status: "created" | "existing";
    plan: DeploymentPlan;
    planRecord: RegistryVersion;
  }> {
    if (input.root.alias !== input.targetAlias) {
      throw new DeploymentServiceError("UNSAFE_TARGET_ROOT", ["target alias does not match the validated root"]);
    }

    const release = await this.deps.records.getCurrent(input.releaseId);
    if (!release || release.kind !== "release") {
      throw new DeploymentServiceError("DEPLOYMENT_NOT_APPROVED", ["release record is missing"]);
    }
    if (release.payload_digest !== input.expectedReleaseDigest) {
      throw new DeploymentServiceError("STALE_DEPLOYMENT", ["release digest changed since the caller loaded it"]);
    }
    const pkg = capabilityPackageSchema.parse(release.payload);

    const decisions = await this.deps.reviews.listDecisionsForSubject(release.record_id);
    const approval = decisions.find((decision) => decision.action === "approve"
      && decision.review_kind === "release"
      && decision.subject_version === release.version
      && decision.subject_digest === release.payload_digest);
    const consumption = approval ? await this.deps.reviews.getConsumption(approval.id) : null;
    if (!approval || consumption?.consumer_id !== release.record_id) {
      throw new DeploymentServiceError("DEPLOYMENT_NOT_APPROVED", [
        "deployment planning requires a finalized exact Release approval"
      ]);
    }

    const targetState = await this.deps.readTargetState(input.root);
    if (!samePointer(targetState.pointer, input.expectedCurrentPointer)) {
      throw new DeploymentServiceError("STALE_DEPLOYMENT", ["current target pointer does not match the plan expectation"]);
    }

    let adapter: DeploymentPlan["adapter"];
    let previewManifestDigest: string;
    let previewDiffDigest: string;
    if (input.target === "obsidian") {
      if (!input.obsidianPreviewDigests) {
        throw new DeploymentServiceError("INVALID_PACKAGE", ["obsidian plans require projection preview digests"]);
      }
      adapter = { name: "obsidian", version: "1.0.0", digest: PROJECTION_ADAPTER_DIGEST };
      previewManifestDigest = input.obsidianPreviewDigests.manifestDigest;
      previewDiffDigest = input.obsidianPreviewDigests.diffDigest;
    } else {
      const renderAdapter = this.deps.adapters[input.target];
      if (!renderAdapter) {
        throw new DeploymentServiceError("ADAPTER_UNSUPPORTED", [`no ${input.target} adapter is registered`]);
      }
      const rendered = renderAdapter(pkg);
      if (!rendered.ok) {
        throw new DeploymentServiceError("ADAPTER_UNSUPPORTED", rendered.diagnostics);
      }
      adapter = {
        name: rendered.result.adapter,
        version: rendered.result.adapter_version,
        digest: rendered.result.source_digest
      };
      previewManifestDigest = rendered.result.output_manifest_digest;
      const diff = diffPackageFiles({
        baseFiles: targetState.files,
        nextFiles: rendered.result.files,
        redactRoots: [input.root.root]
      });
      previewDiffDigest = diff.digest;
    }

    const targetPreimageDigest = digestCanonicalJson({
      schema_version: 1,
      pointer: input.expectedCurrentPointer,
      files: targetState.files.map(({ path, sha256, bytes }) => ({ path, sha256, bytes }))
    });

    const composed = composeDeploymentPlan({
      plan: {
        schema_version: 1,
        action: input.action,
        target: input.target,
        target_alias: input.targetAlias,
        release: { record_id: release.record_id, version: release.version, digest: release.payload_digest },
        adapter,
        preview_manifest_digest: previewManifestDigest,
        preview_diff_digest: previewDiffDigest,
        expected_current_pointer: input.expectedCurrentPointer,
        target_preimage_digest: targetPreimageDigest,
        created_at: this.clock()
      }
    });
    if (!composed.ok) {
      throw new DeploymentServiceError(composed.code, composed.diagnostics);
    }

    const planRecord: RegistryVersion = {
      record_id: composed.planRecordId,
      kind: "deployment_plan",
      version: 1,
      schema_version: 1,
      payload: composed.plan,
      payload_digest: digestCanonicalJson(composed.plan),
      previous_version: null,
      created_at: this.clock()
    };
    const reviewRequest: ReviewRequest = {
      schema_version: 1,
      id: `rev_${digestCanonicalJson({
        schema_version: 1,
        review_kind: "deployment",
        subject_id: planRecord.record_id,
        subject_version: 1,
        subject_digest: planRecord.payload_digest
      }).slice(0, 32)}`,
      review_kind: "deployment",
      subject_id: planRecord.record_id,
      subject_kind: "deployment_plan",
      subject_version: 1,
      subject_digest: planRecord.payload_digest,
      lock_version: 1,
      state: "WAITING_FOR_REVIEW",
      approve_confirmation: confirmationFor({ review_kind: "deployment", subject_id: planRecord.record_id }, "approve"),
      reject_confirmation: confirmationFor({ review_kind: "deployment", subject_id: planRecord.record_id }, "reject"),
      superseded_by_request_id: null,
      created_at: this.clock(),
      updated_at: this.clock()
    };
    const lineage: RegistryLineageEdge[] = [{
      schema_version: 1,
      from_record_id: release.record_id,
      from_kind: "release",
      from_version: release.version,
      from_digest: release.payload_digest,
      relationship: "proposes",
      to_record_id: planRecord.record_id,
      to_kind: "deployment_plan",
      to_version: 1,
      to_digest: planRecord.payload_digest,
      created_at: this.clock()
    }];

    try {
      const status = await this.deps.exports.composeDeploymentPlan({ plan: planRecord, lineage, reviewRequest });
      return { status, plan: composed.plan, planRecord };
    } catch (error) {
      throw mapExportError(error);
    }
  }
}
