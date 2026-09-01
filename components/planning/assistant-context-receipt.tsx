import type { AssistantContextReceipt } from "@/lib/assistant/context";

export function AssistantContextReceiptView({ receipt }: { receipt: AssistantContextReceipt }) {
  return (
    <section className="assistant-receipt" aria-label="Context receipt">
      <h3>Context receipt</h3>
      <p>{receipt.source_mode.replaceAll("-", " ")}{receipt.head_revision ? ` · ${receipt.head_revision}` : ""}</p>
      <ul>
        {receipt.sources.map((source) => (
          <li key={source.source_id}>
            <code>{source.path}</code>
            <span>{source.selected ? "Included" : "Available"}</span>
          </li>
        ))}
      </ul>
      {receipt.issues.length > 0 && <p className="assistant-receipt__issue">{receipt.issues.length} source issue{receipt.issues.length === 1 ? "" : "s"} noted.</p>}
    </section>
  );
}
