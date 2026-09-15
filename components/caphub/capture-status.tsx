"use client";

import { useEffect, useRef } from "react";
import { Check, Copy } from "lucide-react";
import { z } from "zod";
import { captureRecordSchema, objectRefSchema } from "@/lib/caphub/domain/schemas";

// The HTTP projection deliberately omits storage keys and idempotency keys.
// Keep every level strict so a server contract drift cannot become UI content.
export const captureReceiptSchema = z.object({
  kind: z.enum(["created", "duplicate"]),
  capture: captureRecordSchema.omit({ object: true, idempotency_key: true }).extend({
    object: z.object({
      algorithm: objectRefSchema.shape.algorithm,
      digest: objectRefSchema.shape.digest,
      bytes: objectRefSchema.shape.bytes
    }).strict()
  }).strict()
}).strict();

export type CaptureReceipt = z.infer<typeof captureReceiptSchema>;
export interface CaptureError {
  code: string;
  message: string;
}

export function CaptureStatus({ receipt, error, onChooseAnother }: {
  receipt: CaptureReceipt | null;
  error?: CaptureError | null;
  onChooseAnother?: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (receipt || error) headingRef.current?.focus();
  }, [receipt, error]);

  const capture = receipt?.capture;
  const duplicate = receipt?.kind === "duplicate";

  return (
    <section className="caphub-receipt-area" aria-labelledby="capture-receipt-title">
      <div className="caphub-section-heading">
        <h2 id="capture-receipt-title" ref={headingRef} tabIndex={-1}>Capture receipt</h2>
        <span>Metadata only</span>
      </div>
      {capture ? (
        <article className="caphub-receipt" data-kind={receipt.kind} aria-label={duplicate ? "Duplicate capture receipt" : "Created capture receipt"}>
          <div className="caphub-receipt__lead">
            <span className="caphub-receipt__mark" aria-hidden="true">{duplicate ? <Copy /> : <Check />}</span>
            <div>
              <h3>{duplicate ? "Duplicate — existing receipt returned" : "Capture received"}</h3>
              <p>{duplicate
                ? "This capture already exists. The existing receipt was returned without creating another capture."
                : "The original bytes and metadata were stored once. No analysis has started."}</p>
            </div>
            <span className="caphub-receipt__badge">{duplicate ? "Existing" : "Created"}</span>
          </div>
          <dl className="caphub-receipt__grid">
            <div><dt>Capture ID</dt><dd><code>{capture.id}</code></dd></div>
            <div><dt>Filename</dt><dd>{capture.source.original_filename}</dd></div>
            <div><dt>Created</dt><dd><time dateTime={capture.created_at}>{new Date(capture.created_at).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}</time></dd></div>
            <div><dt>Status</dt><dd>{capture.status}</dd></div>
            <div><dt>Digest</dt><dd><code>{capture.object.digest.slice(0, 8)}…</code></dd></div>
            <div><dt>Review</dt><dd>Human review required</dd></div>
          </dl>
          {onChooseAnother && <div className="caphub-receipt__actions"><button className="caphub-quiet-button" type="button" onClick={onChooseAnother}>Receive another image</button></div>}
        </article>
      ) : error ? (
        <div className="caphub-error" role="alert">
          <h3>Capture receipt was not returned</h3>
          <p><code>{error.code}</code> · {error.message}</p>
        </div>
      ) : (
        <p className="caphub-receipt-empty">A receipt appears here after Caphub validates and stores the evidence. The raw image is never shown on this page.</p>
      )}
    </section>
  );
}
