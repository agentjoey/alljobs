"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, Upload } from "lucide-react";
import { z } from "zod";
import { captureMimeTypeSchema, captureRecordSchema } from "@/lib/caphub/domain/schemas";
import { usePublishCaphubState } from "@/components/planning/source-status";
import { CaptureStatus, captureMetadataSchema, captureReceiptSchema, type CaptureError, type CaptureReceipt } from "./capture-status";
import { FilenameConflictPrompt, filenameConflictSchema, type FilenameConflict } from "./filename-conflict";

const errorCodeSchema = z.enum([
  "CAPHUB_DISABLED", "ORIGIN_NOT_ALLOWED", "INVALID_INPUT", "INVALID_REQUEST",
  "UNSUPPORTED_MEDIA_TYPE", "PAYLOAD_TOO_LARGE", "IDEMPOTENCY_CONFLICT",
  "STORAGE_UNAVAILABLE", "AUDIT_WRITE_FAILED", "CONTENT_LENGTH_REQUIRED", "INTERNAL_ERROR"
]);
const errorResponseSchema = z.object({ error: z.object({ code: errorCodeSchema, message: z.string() }).strict() }).strict();
const RETRY_MESSAGE = "No receipt was returned. Retry this same capture with its retained idempotency key, or stop and inspect operations.";
const VALIDATION_CODES = new Set(["INVALID_INPUT", "INVALID_REQUEST", "UNSUPPORTED_MEDIA_TYPE", "PAYLOAD_TOO_LARGE", "IDEMPOTENCY_CONFLICT", "CONTENT_LENGTH_REQUIRED"]);

interface Selection { image: File; key: string }
interface ValidationError { field: "image" | "source" | "note"; message: string }

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} KiB` : `${Number((bytes / 1024 / 1024).toFixed(2))} MiB`;
}

export function CaptureForm({ enabled, maxUploadBytes }: { enabled: boolean; maxUploadBytes: number }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [note, setNote] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [validation, setValidation] = useState<ValidationError | null>(null);
  const [error, setError] = useState<CaptureError | null>(null);
  const [receipt, setReceipt] = useState<CaptureReceipt | null>(null);
  const [conflict,setConflict]=useState<FilenameConflict|null>(null);
  const confirmedHead=useRef<FilenameConflict|null>(null);
  const chooseRef=useRef<HTMLButtonElement>(null);
  const [readPending, setReadPending] = useState(false);
  const [readError, setReadError] = useState<{ attempt: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const readInFlight = useRef(false);
  const readSequence = useRef(0);
  const disabled = !enabled || unavailable;
  const contextLocked = disabled || pending || attempted;
  const limit = formatBytes(maxUploadBytes);
  usePublishCaphubState(disabled ? "Disabled" : validation || (error && VALIDATION_CODES.has(error.code)) ? "Validation Error" : pending ? "Receiving"
    : readError ? "Read Error" : receipt ? "Received" : error ? "Storage Error" : "Ready");

  // A later selection or unmount must not restore an earlier receipt.
  useEffect(() => () => { readSequence.current += 1; }, []);

  async function readReceipt(known: CaptureReceipt) {
    if (readInFlight.current) return;
    readInFlight.current = true;
    const sequence = ++readSequence.current;
    setReadPending(true);
    try {
      const response = await fetch(`/api/caphub/captures/${known.capture.id}`, { method: "GET", cache: "no-store" });
      if (!response.ok) throw new Error("Receipt read unavailable");
      const result = captureMetadataSchema.safeParse(await response.json());
      if (!result.success || result.data.capture.id !== known.capture.id) throw new Error("Unverified receipt metadata");
      if (sequence !== readSequence.current) return;
      setReceipt({ ...known, capture: result.data.capture });
      setReadError(null);
      setAnnouncement("Receipt metadata refreshed. Human review is required.");
    } catch {
      if (sequence !== readSequence.current) return;
      setReadError({ attempt: sequence });
      setAnnouncement("Receipt metadata is temporarily unavailable. The known receipt remains available. Retry reads metadata only.");
    } finally {
      if (sequence === readSequence.current) {
        readInFlight.current = false;
        setReadPending(false);
      }
    }
  }

  function chooseFiles(files: FileList | File[]) {
    if (disabled || inFlight.current || files.length === 0) return;
    const image = files[0];
    let message: string | null = null;
    if (files.length !== 1) message = "Choose one image at a time. No bytes were staged.";
    else if (!captureMimeTypeSchema.safeParse(image.type).success) message = "Choose a PNG, JPEG, or WebP file. This image type is not supported; no bytes were staged.";
    else if (image.size === 0) message = "This image is empty. Choose a PNG, JPEG, or WebP with content.";
    else if (image.size > maxUploadBytes) message = `This image is larger than ${limit}. No bytes were staged. Choose a smaller PNG, JPEG, or WebP.`;
    else if (image.name.length === 0 || image.name.length > 255) message = "Use an image filename between 1 and 255 characters.";

    readSequence.current += 1;
    readInFlight.current = false;
    setReadPending(false);
    setReadError(null);
    setReceipt(null);
    setConflict(null);confirmedHead.current=null;
    setError(null);
    setAttempted(false);
    if (message) {
      setSelection(null);
      setValidation({ field: "image", message });
      setAnnouncement("");
      return;
    }
    setValidation(null);
    setSelection({ image, key: crypto.randomUUID() });
    setAnnouncement(`${image.name} selected and ready to receive.`);
  }

  async function submit(event?: FormEvent<HTMLFormElement>,confirmation?:FilenameConflict) {
    event?.preventDefault();
    if (disabled || inFlight.current || (receipt && receipt.analysis?.enqueue!=="failed") || !selection || (conflict&&!confirmation)) return;
    if(confirmation)confirmedHead.current=confirmation;
    let validSource = false;
    try {
      validSource = captureRecordSchema.shape.source.shape.source_url.safeParse(sourceUrl || undefined).success;
    } catch {
      // The shared HTTPS refinement can throw for malformed URL syntax.
      // All browser input failures still become recoverable field feedback.
    }
    if (!validSource) {
      setValidation({ field: "source", message: "Enter a valid HTTPS URL of at most 2,048 characters, or leave this field empty." });
      return;
    }
    if (!captureRecordSchema.shape.note.safeParse(note).success) {
      setValidation({ field: "note", message: "Keep the note to 4,000 characters or fewer." });
      return;
    }

    // Lock context after the first attempt: a lost response may follow a durable
    // write, so every retry must carry exactly the same canonical payload.
    inFlight.current = true;
    setPending(true);
    setAttempted(true);
    setValidation(null);
    setError(null);
    setAnnouncement("Receiving capture… Keep this page open.");
    const body = new FormData();
    body.set("image", selection.image);
    body.set("idempotency_key", selection.key);
    body.set("note", note);
    body.set("source_url", sourceUrl);
    if(confirmedHead.current){
      body.set("expected_current_capture_id",confirmedHead.current.existing.id);
      body.set("expected_current_object_digest",confirmedHead.current.existing.digest);
    }
    try {
      const response = await fetch("/api/caphub/captures", { method: "POST", body });
      const payload: unknown = await response.json();
      const filenameConflict=filenameConflictSchema.safeParse(payload);
      if(response.status===409&&filenameConflict.success){
        setConflict(filenameConflict.data.error);confirmedHead.current=null;setAnnouncement("Same filename, different image. Choose whether to create a new version.");return;
      }
      const queueFailure=z.object({receipt:captureReceiptSchema,error:z.object({code:z.literal("ANALYSIS_QUEUE_UNAVAILABLE"),message:z.string()})}).safeParse(payload);
      if(response.status===503&&queueFailure.success){setReceipt(queueFailure.data.receipt);setAnnouncement("Image saved. Retry to queue analysis.");return;}
      if (response.status === 200 || response.status === 201) {
        const result = captureReceiptSchema.safeParse(payload);
        if (!result.success || result.data.kind !== (response.status === 201 ? "created" : "duplicate")) {
          setError({ code: "INVALID_RECEIPT", message: "The receipt could not be verified. Retry this same capture with its retained idempotency key, or stop and inspect operations." });
          setAnnouncement("The receipt could not be verified.");
          return;
        }
        setReceipt(result.data);
        setConflict(null);
        setAnnouncement(result.data.kind === "created" ? "Capture received. Human review is required." : "Duplicate detected. The existing Capture receipt was returned. Human review is required.");
        void readReceipt(result.data);
        return;
      }
      const failure = errorResponseSchema.safeParse(payload);
      const code = failure.success ? failure.data.error.code : "INTERNAL_ERROR";
      if (code === "CAPHUB_DISABLED" || code === "ORIGIN_NOT_ALLOWED") {
        setUnavailable(true);
        setAnnouncement("Caphub capture is unavailable.");
        return;
      }
      const message = code === "IDEMPOTENCY_CONFLICT"
        ? "No receipt was returned. This submission conflicts with an existing capture. Choose a different image to start a new intake, or stop and inspect operations."
        : RETRY_MESSAGE;
      setError({ code, message });
      setAnnouncement("Capture receipt was not returned.");
    } catch {
      setError({ code: "SERVICE_UNAVAILABLE", message: RETRY_MESSAGE });
      setAnnouncement("Capture receipt was not returned.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  function openChooser() {
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.click();
    }
  }

  const submitLabel = disabled ? "Capture unavailable" : pending ? "Receiving capture…"
    : receipt?.analysis?.enqueue==="failed" ? "Retry analysis queue" : receipt ? (receipt.kind === "created" ? "Receipt returned" : "Existing receipt returned")
    : error ? "Retry same capture" : selection ? "Receive capture" : "Choose an image to continue";
  const custodyTitle = receipt ? "Image saved."
    : pending ? "Saving your image…"
    : error ? "The capture receipt is not yet confirmed."
    : selection ? "Ready to upload."
    : "Upload once. Follow the analysis here.";

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      {disabled && <div className="caphub-notice" role="alert">
        <AlertCircle aria-hidden="true" />
        <div>
          <h2>{unavailable ? "Caphub capture is unavailable" : "Caphub capture is disabled on this Control Host"}</h2>
          <p>Capture remains unavailable until a separate Human-approved configuration and release gate. This page cannot change that boundary.</p>
        </div>
      </div>}
      <form className="caphub-workbench" aria-label="Receive one screenshot" aria-busy={pending} onSubmit={submit} noValidate>
        <section className="caphub-evidence-panel" aria-labelledby="capture-evidence-title">
          <div className="caphub-section-heading"><h2 id="capture-evidence-title">Evidence</h2><span>One image · max {limit}</span></div>
          <input ref={inputRef} id="capture-image" aria-label="Screenshot image" type="file" accept="image/png,image/jpeg,image/webp" hidden
            disabled={disabled || pending} aria-invalid={validation?.field === "image"} aria-describedby="capture-file-help capture-validation"
            onChange={(event) => { if (event.currentTarget.files) chooseFiles(event.currentTarget.files); }} />
          <div className="caphub-drop-zone" role="group" aria-label="Screenshot drop area" aria-describedby="capture-file-help capture-validation"
            onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFiles(event.dataTransfer.files); }}>
            {selection ? <div className="caphub-selected-file">
              <span className="caphub-file-mark" aria-hidden="true">{selection.image.type.split("/")[1].toUpperCase()}</span>
              <div><strong>{selection.image.name}</strong><small>{selection.image.type} · {formatBytes(selection.image.size)}</small></div>
              <button ref={chooseRef} className="caphub-quiet-button" type="button" onClick={openChooser} disabled={disabled || pending || !!receipt}>Choose different image</button>
            </div> : <div className="caphub-drop-content">
              <span className="caphub-upload-mark" aria-hidden="true"><Upload /></span>
              <span className="caphub-promise">Capture → Analyze → Review</span>
              <h3>Drop a screenshot here</h3>
              <p id="capture-file-help">PNG, JPEG, or WebP. Matching images reuse existing results.</p>
              <button ref={chooseRef} className="caphub-quiet-button" type="button" onClick={openChooser} disabled={disabled || pending}>Choose image</button>
            </div>}
            {selection && <p id="capture-file-help" className="sr-only">One PNG, JPEG, or WebP. Maximum {limit}.</p>}
            {validation?.field === "image" && <p className="caphub-inline-error" id="capture-validation" role="alert">{validation.message}</p>}
          </div>
        </section>
        <section className="caphub-context-panel" aria-labelledby="capture-context-title">
          <div className="caphub-section-heading"><h2 id="capture-context-title">Known context</h2><span>Optional</span></div>
          <div className="caphub-field" data-invalid={validation?.field === "source" || undefined}>
            <label htmlFor="capture-source">Source URL <span>HTTPS only</span></label>
            <input id="capture-source" type="text" inputMode="url" placeholder="https://www.douyin.com/…" maxLength={2048} value={sourceUrl} disabled={contextLocked}
              aria-invalid={validation?.field === "source"} aria-describedby="capture-source-help capture-context-error" onChange={(event) => setSourceUrl(event.target.value)} />
            <p id="capture-source-help">Optional context to help identify the source.</p>
          </div>
          <div className="caphub-field" data-invalid={validation?.field === "note" || undefined}>
            <label htmlFor="capture-note">Note <span>{note.length.toLocaleString("en-US")} / 4,000</span></label>
            <textarea id="capture-note" placeholder="Why is this worth investigating? What should future review verify?" maxLength={4000} value={note} disabled={contextLocked}
              aria-invalid={validation?.field === "note"} aria-describedby="capture-context-error" onChange={(event) => setNote(event.target.value)} />
          </div>
          {validation && validation.field !== "image" && <p id="capture-context-error" className="caphub-inline-error" role="alert">{validation.message}</p>}
          {attempted && !receipt && !pending && !disabled && <p className="caphub-retry-help">Context stays fixed for a safe retry. Choose a different image to start a new intake.</p>}
          <button className="caphub-submit" type="submit" disabled={disabled || pending || (!!receipt&&receipt.analysis?.enqueue!=="failed") || !selection || !!conflict}>
            {pending && <span className="caphub-spinner" aria-hidden="true" />}{submitLabel}
          </button>
        </section>
      </form>
      {conflict&&<FilenameConflictPrompt conflict={conflict} pending={pending} onConfirm={()=>void submit(undefined,conflict)} onCancel={()=>{
        setConflict(null);setSelection(null);setAttempted(false);confirmedHead.current=null;
        setTimeout(()=>chooseRef.current?.focus(),0);
      }}/>}
      <section className="caphub-custody" aria-label="Capture custody boundary">
        <div>
          {selection && <span className="caphub-custody__identity">{selection.image.name}</span>}
          <strong>{custodyTitle}</strong>
          <p>{error ? "No receipt was returned. Retry with the retained idempotency key; evidence may already be stored."
            : receipt ? "You can leave after upload. Queued analysis continues in the background."
            : pending ? "Keep this page open. Caphub is validating and storing this image once; a second request is unavailable."
            : "Original images expire 30 days after parsed information is saved. Results remain available."}</p>
        </div>
        <span className="caphub-custody__state">Human review required</span>
      </section>
      <CaptureStatus receipt={receipt} error={error} readPending={readPending} readError={readError}
        onRetryRead={() => { if (receipt) void readReceipt(receipt); }} onChooseAnother={openChooser} />
    </>
  );
}
