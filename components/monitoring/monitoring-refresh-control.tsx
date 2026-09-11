"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { requestMonitoringRefresh } from "@/app/actions/monitoring-refresh";

// Manual refresh control (design §5.2; plan Task 8). The control can only name
// an already registered Project/binding — the Server Action enforces
// same-origin, single-flight, backoff, and minimum intervals. The control
// never blocks: every ack keeps serving the cached projection, so the button
// stays enabled and the outcome is announced through a polite live region.

export function MonitoringRefreshControl({
  project,
  bindingId
}: {
  project: string;
  bindingId?: string;
}) {
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();

  const onRefresh = () => {
    startTransition(async () => {
      const result = await requestMonitoringRefresh({ project, binding_id: bindingId });
      if (result.status === "error") {
        // Server-side messages are normalized and secret-free.
        setAnnouncement(result.message);
        return;
      }
      const { refresh, serving, retry_after_seconds } = result.data;
      if (refresh === "queued") {
        setAnnouncement(
          `Refresh queued — the cached projection${
            serving ? ` (cycle ${serving.cycle_id})` : ""
          } keeps being served while collection runs.`
        );
      } else if (refresh === "collecting") {
        setAnnouncement(
          "A monitoring collection is already running; the cached projection keeps being served."
        );
      } else {
        setAnnouncement(
          `Monitoring refresh is backing off — retry in ${retry_after_seconds ?? "?"} seconds; the cached projection keeps being served.`
        );
      }
    });
  };

  return (
    <div className="mon-refresh">
      <Button
        type="button"
        variant="outline"
        className="mon-refresh__button"
        aria-busy={pending}
        onClick={onRefresh}
      >
        Refresh monitoring
      </Button>
      <p role="status" aria-live="polite" className="mon-refresh__status">
        {announcement}
      </p>
    </div>
  );
}
