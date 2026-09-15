import { CaptureForm } from "@/components/caphub/capture-form";
import { loadControlHostConfig } from "@/lib/planning/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function CaphubPage() {
  let enabled = false;
  let maxUploadBytes = 10_485_760;
  try {
    const caphub = loadControlHostConfig().config.caphub;
    enabled = caphub?.enabled === true;
    maxUploadBytes = caphub?.maxUploadBytes ?? maxUploadBytes;
  } catch {
    // Configuration details and host paths never cross the server boundary.
  }

  return (
    <div className="caphub-page">
      <section className="caphub-intro" aria-labelledby="caphub-title">
        <div>
          <h1 id="caphub-title">Preserve the evidence first.</h1>
          <p>Send one screenshot into Caphub as immutable evidence. Add the context you already know; analysis and capability decisions happen in later, Human-approved phases.</p>
        </div>
        <p className="caphub-scope"><strong>P1 boundary</strong>This inbox stores a traceable Capture and audit event. It does not read the screenshot, call a model, install anything, or publish a capability.</p>
      </section>
      <CaptureForm enabled={enabled} maxUploadBytes={maxUploadBytes} />
      <ul className="caphub-boundaries" aria-label="P1 safeguards">
        <li><strong>Immutable evidence</strong><span>Content-addressed bytes are never overwritten and are not exposed from this page.</span></li>
        <li><strong>Safe retry</strong><span>One idempotency key stays bound to the selected image until a receipt is returned.</span></li>
        <li><strong>Human boundary</strong><span>Every Capture stops at received. Analysis, approval, and release remain absent.</span></li>
      </ul>
    </div>
  );
}
