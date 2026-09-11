import {
  MONITORING_PROVIDER_CAPABILITIES,
  type MonitoringProvider
} from "../domain/schemas";
import type { MonitoringAdapter } from "./contracts";
import { createFlyAdapter } from "./fly";
import { createFixtureAdapter } from "./fixture";
import { createNeonAdapter } from "./neon";
import { createRailwayAdapter } from "./railway";
import { createSupabaseAdapter } from "./supabase";

// Adapter registry (design §13, plan Task 7). Production resolution is a fixed
// set of the four Phase 1 adapters constructed from code alone — there is no
// parameter, so no browser- or caller-selected adapter can ever enter the
// collection path. The fixture registry exists only for tests: it refuses to
// construct unless NODE_ENV === "test" and must be injected explicitly.

export type MonitoringAdapterRegistry = Readonly<Partial<Record<MonitoringProvider, MonitoringAdapter>>>;

/** Providers covered by the deterministic fixture registry. */
export const FIXTURE_ADAPTER_REGISTRY_PROVIDERS = ["railway", "fly", "neon", "supabase"] as const satisfies readonly MonitoringProvider[];

/** The fixed production adapter set. Accepts no input by design. */
export function createMonitoringAdapterRegistry(): MonitoringAdapterRegistry {
  return {
    railway: createRailwayAdapter(),
    fly: createFlyAdapter(),
    neon: createNeonAdapter(),
    supabase: createSupabaseAdapter()
  };
}

/**
 * Deterministic fixture adapters keyed by provider, each declaring exactly the
 * domain-supported signals for that provider. Test-only: throws when
 * NODE_ENV !== "test" so production resolution can never serve fixtures.
 */
export function createFixtureAdapterRegistry(
  providers: readonly (typeof FIXTURE_ADAPTER_REGISTRY_PROVIDERS)[number][] = FIXTURE_ADAPTER_REGISTRY_PROVIDERS
): MonitoringAdapterRegistry {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("fixture adapter registry is only available when NODE_ENV === 'test'");
  }
  const registry: Partial<Record<MonitoringProvider, MonitoringAdapter>> = {};
  for (const provider of providers) {
    registry[provider] = createFixtureAdapter({
      provider,
      version: "0.0.0-fixture",
      supportedSignals: MONITORING_PROVIDER_CAPABILITIES[provider].supportedSignals
    });
  }
  return registry;
}
