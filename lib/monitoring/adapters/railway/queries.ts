import { AdapterError } from "../contracts";

// Railway Public API fixed request documents (design §12.1, §13). The adapter
// speaks GraphQL over POST but is read-only: exactly two static query
// documents exist, every binding value travels as a GraphQL variable, and any
// document containing a mutation is refused before dispatch.
//
// References (re-verified 2026-09-11; adapter compatibility date 2026-09-11):
// - Public API endpoint, Bearer tokens, GraphQL-over-HTTP:
//   https://docs.railway.com/integrations/api
// - Deployment statuses and the deployments query:
//   https://docs.railway.com/guides/manage-deployments
// - Error convention (HTTP 200 + errors array), 429 + Retry-After:
//   https://railway.com/api-reliability.md
// - Metrics query shape and MetricMeasurement values:
//   https://github.com/railwayapp/railway-skills/blob/main/plugins/railway/skills/use-railway/references/request.md
export const RAILWAY_ADAPTER_COMPATIBILITY_DATE = "2026-09-11";

/** Latest deployment for one <project>/<environment>/<service> locator. */
export const RAILWAY_LATEST_DEPLOYMENT_QUERY = `query LatestDeployment($projectId: String!, $environmentId: String!, $serviceId: String!) {
  deployments(
    first: 1
    input: { projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId }
  ) {
    edges {
      node {
        id
        status
        createdAt
        url
      }
    }
  }
}`;

/** Operational CPU/memory/network series for the same locator. */
export const RAILWAY_SERVICE_METRICS_QUERY = `query ServiceMetrics($projectId: String!, $environmentId: String!, $serviceId: String!, $startDate: DateTime!, $measurements: [MetricMeasurement!]!) {
  metrics(
    projectId: $projectId
    environmentId: $environmentId
    serviceId: $serviceId
    startDate: $startDate
    measurements: $measurements
  ) {
    measurement
    values {
      ts
      value
    }
  }
}`;

/** The complete allowlist of query documents this adapter may send. */
export const RAILWAY_QUERY_DOCUMENTS = [
  RAILWAY_LATEST_DEPLOYMENT_QUERY,
  RAILWAY_SERVICE_METRICS_QUERY
] as const;

/** Operational-only measurements; billing cost/allowance is never queried. */
export const RAILWAY_METRIC_MEASUREMENTS = [
  "CPU_USAGE",
  "MEMORY_USAGE_GB",
  "NETWORK_RX_GB",
  "NETWORK_TX_GB"
] as const;

/**
 * Read-only guard applied to every document before dispatch. Railway serves
 * queries and mutations on the same endpoint, so the fixed allowlist is
 * enforced in code: a document containing a mutation is never sent.
 */
export function assertReadOnlyQueryDocument(document: string): void {
  if (/\bmutation\b/i.test(document)) {
    throw new AdapterError(
      "unsupported_capability",
      "railway adapter refuses to send a GraphQL document containing a mutation"
    );
  }
}
