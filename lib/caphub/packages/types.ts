import type { z } from "zod";
import type {
  capabilityPackageSchema,
  deploymentPlanIdSchema,
  deploymentPlanSchema,
  deploymentTargetSchema,
  packageDependencySchema,
  packageEvaluationSchema,
  packageEvidenceRefSchema,
  packageFileSchema,
  packageIdSchema,
  packageLicenseSchema,
  packageLineageRefSchema,
  packageResourceSchema,
  p4ErrorCodeSchema,
  projectionEntrySchema,
  semverSchema,
  slugSchema
} from "./schemas";

export type SemVer = z.infer<typeof semverSchema>;
export type Slug = z.infer<typeof slugSchema>;
export type PackageId = z.infer<typeof packageIdSchema>;
export type DeploymentPlanId = z.infer<typeof deploymentPlanIdSchema>;
export type P4ErrorCode = z.infer<typeof p4ErrorCodeSchema>;
export type DeploymentTarget = z.infer<typeof deploymentTargetSchema>;
export type CapabilityPackage = z.infer<typeof capabilityPackageSchema>;
export type PackageDependency = z.infer<typeof packageDependencySchema>;
export type PackageEvaluation = z.infer<typeof packageEvaluationSchema>;
export type PackageEvidenceRef = z.infer<typeof packageEvidenceRefSchema>;
export type PackageFile = z.infer<typeof packageFileSchema>;
export type PackageLicense = z.infer<typeof packageLicenseSchema>;
export type PackageLineageRef = z.infer<typeof packageLineageRefSchema>;
export type PackageResource = z.infer<typeof packageResourceSchema>;
export type DeploymentPlan = z.infer<typeof deploymentPlanSchema>;
export type ProjectionEntry = z.infer<typeof projectionEntrySchema>;
