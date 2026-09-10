import type { z } from "zod";
import type {
  adapterMetadataSchema,
  attentionLevelSchema,
  attentionReasonSchema,
  billingAlignmentSchema,
  collectorSignalSchema,
  deploymentSignalSchema,
  expectedRuntimeSchema,
  freshnessSignalSchema,
  monitoringBindingSchema,
  monitoringProbeSchema,
  monitoringSnapshotSchema,
  platformIncidentSignalSchema,
  runtimeSignalSchema,
  signalDimensionSchema,
  signalFreshnessSchema,
  usageMeasureSchema
} from "./schemas";

export type { MonitoringProvider, RequiredSignal, MonitoringProviderCapabilities } from "./schemas";

export type AttentionLevel = z.infer<typeof attentionLevelSchema>;
export type ExpectedRuntime = z.infer<typeof expectedRuntimeSchema>;
export type BillingAlignment = z.infer<typeof billingAlignmentSchema>;
export type SignalDimension = z.infer<typeof signalDimensionSchema>;
export type MonitoringProbe = z.infer<typeof monitoringProbeSchema>;
export type MonitoringBinding = z.infer<typeof monitoringBindingSchema>;
export type AttentionReason = z.infer<typeof attentionReasonSchema>;
export type CollectorSignal = z.infer<typeof collectorSignalSchema>;
export type DeploymentSignal = z.infer<typeof deploymentSignalSchema>;
export type RuntimeSignal = z.infer<typeof runtimeSignalSchema>;
export type UsageMeasure = z.infer<typeof usageMeasureSchema>;
export type PlatformIncidentSignal = z.infer<typeof platformIncidentSignalSchema>;
export type SignalFreshness = z.infer<typeof signalFreshnessSchema>;
export type FreshnessSignal = z.infer<typeof freshnessSignalSchema>;
export type AdapterMetadata = z.infer<typeof adapterMetadataSchema>;
export type MonitoringSnapshot = z.infer<typeof monitoringSnapshotSchema>;
