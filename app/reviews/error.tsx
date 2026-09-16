"use client";

export default function ReviewsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="registry-state" role="alert"><h1>Review Center could not be read.</h1><p>Safe error <code>REGISTRY_READ_ERROR</code>. No database or secret detail is shown.</p><button className="registry-quiet-button" type="button" onClick={reset}>Retry read</button></section>;
}
