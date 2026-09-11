import { MonitoringOverview } from "@/components/monitoring/monitoring-overview";
import { getMonitoringLanding } from "@/lib/monitoring/queries/landing";

// R5 Application Monitoring landing (design §11.1). force-dynamic: every
// request re-reads the atomically published projection pointer; the page never
// calls a provider during render.
export const dynamic = "force-dynamic";

export default async function MonitoringPage() {
  const view = await getMonitoringLanding();
  return <MonitoringOverview view={view} />;
}
