import "server-only";

import type { Pool } from "pg";
import { loadControlHostConfig } from "../../planning/config";
import { capabilityCandidateSchema, reviewPacketSchema } from "../analysis/schemas";
import { capabilityPackageSchema } from "../packages/schemas";
import { PostgresStageArtifactStore } from "../registry/postgres/caphub-stores";
import { PostgresExportStore } from "../registry/postgres/exports";
import { PostgresRegistryLineageStore, PostgresRegistryRecordStore } from "../registry/postgres/records";
import { PostgresReviewStore } from "../registry/postgres/reviews";
import { loadControlHostRegistryRuntime, RegistryRuntimeError } from "../registry/runtime";
import { ReleaseService } from "./service";

export function createReleaseService(input: { pool: Pool; clock?: () => string }): ReleaseService {
  return new ReleaseService({
    exports: new PostgresExportStore(input.pool, { clock: input.clock }),
    records: new PostgresRegistryRecordStore(input.pool, {
      candidate: capabilityCandidateSchema,
      review_packet: reviewPacketSchema,
      release: capabilityPackageSchema
    }),
    reviews: new PostgresReviewStore(input.pool, { clock: input.clock }),
    lineage: new PostgresRegistryLineageStore(input.pool),
    packets: new PostgresStageArtifactStore(input.pool),
    clock: input.clock
  });
}

export async function loadControlHostReleaseService(options: {
  env?: Readonly<Record<string, string | undefined>>;
  home?: string;
} = {}): Promise<ReleaseService> {
  const resolved = loadControlHostConfig(options.home);
  const caphub = resolved.config.caphub;
  if (!caphub?.enabled || !caphub.registry.enabled || !caphub.exports.enabled) {
    throw new RegistryRuntimeError("REGISTRY_DISABLED");
  }
  const registry = await loadControlHostRegistryRuntime({ resolved, env: options.env ?? process.env });
  return createReleaseService({ pool: registry.pool });
}
