"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { AssistantEntryState } from "@/lib/assistant/context";
import type { AssistantMode, AssistantRequestIntent, AssistantStreamEvent, BacklogProposal, ManagementAnswer, ManagementRecommendation, SourceAccessProposal } from "@/lib/assistant/contracts";
import { AssistantAnswer } from "./assistant-answer";
import { AssistantContextReceiptView } from "./assistant-context-receipt";
import { AssistantSourceGate } from "./assistant-source-gate";
import { defaultAssistantMode, parseAssistantNdjson, readAssistantSession, writeAssistantSession } from "./assistant-session";
import { toNativeTaskDraftInitialValues, type NativeTaskDraftInitialValues } from "@/lib/assistant/draft-client";

export type AssistantRequester = (intent: AssistantRequestIntent) => Promise<AssistantStreamEvent[]>;

function selectedOptionalSources(entry?: AssistantEntryState): string[] {
  return entry && entry.enabled
    ? entry.receipt.sources.filter((source) => source.optional && source.selected).map((source) => source.source_id)
    : [];
}

async function requestAssistant(intent: AssistantRequestIntent): Promise<AssistantStreamEvent[]> {
  const response = await fetch("/api/assistant/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(intent)
  });
  if (!response.ok) throw new Error(`Assistant request failed (${response.status}).`);
  const parsed = parseAssistantNdjson(await response.text());
  if (parsed.incomplete) throw new Error("The run ended before a complete result was received. Try again.");
  return parsed.events;
}

export function AssistantPanel({ projectSlug, entry, request = requestAssistant, onUseTaskDraft }: { projectSlug: string; entry?: AssistantEntryState; request?: AssistantRequester; onUseTaskDraft?: (draft: NativeTaskDraftInitialValues) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AssistantMode>("standard");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<ManagementAnswer | null>(null);
  const [stale, setStale] = useState(false);
  const [proposal, setProposal] = useState<SourceAccessProposal | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [backlogProposal, setBacklogProposal] = useState<{ proposal: BacklogProposal; handoff: string } | null>(null);
  const [selectedOptionalSourceIds, setSelectedOptionalSourceIds] = useState<string[]>(() => selectedOptionalSources(entry));
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setOpen(false);
    setQuestion("");
    setAnswer(null);
    setProposal(null);
    setMessage(null);
    setSelectedOptionalSourceIds(selectedOptionalSources(entry));
  }, [projectSlug]);

  useEffect(() => {
    if (!open) return;
    const stored = readAssistantSession(projectSlug, window.sessionStorage);
    setMode(defaultAssistantMode(stored));
    if (stored?.currentRun?.manifestDigest === (entry && entry.enabled ? entry.manifest_digest : "")) {
      setAnswer({ kind: "management_answer", direct_answer: stored.currentRun.directAnswer, confirmed_facts: [], inferences: [], unknowns: [], questions: [], recommendations: [], citations: [] });
    }
    headingRef.current?.focus();
  }, [open, projectSlug, entry]);

  if (!entry || !entry.enabled) {
    const disabledMessage = entry?.message ?? "Management assistant is unavailable for this project.";
    return <div className="assistant-entry"><button type="button" className="btn" disabled>Management assistant</button><span>{disabledMessage}</span></div>;
  }

  const persist = (nextMode: AssistantMode, nextAnswer: ManagementAnswer | null) => {
    writeAssistantSession(projectSlug, nextAnswer
      ? { mode: nextMode, currentRun: { directAnswer: nextAnswer.direct_answer, manifestDigest: entry.manifest_digest } }
      : { mode: nextMode }, window.sessionStorage);
  };

  const consume = async (intent: AssistantRequestIntent) => {
    setRunning(true); setMessage(null); setProposal(null);
    try {
      const events = await request(intent);
      let nextAnswer: ManagementAnswer | null = null;
      let nextProposal: SourceAccessProposal | null = null;
      let nextMessage: string | null = null;
      let nextStale = false;
      for (const event of events) {
        if (event.type === "assistant_complete" && event.outcome.kind === "management_answer") { nextAnswer = event.outcome; nextStale = event.stale; }
        if (event.type === "source_access_requested") nextProposal = event.proposal;
        if (event.type === "assistant_error") nextMessage = event.message;
        if (event.type === "task_draft" && !event.stale) { onUseTaskDraft?.(toNativeTaskDraftInitialValues(event.draft, { model: event.model, mode: event.mode, manifest_digest: event.draft.manifest_digest })); setOpen(false); nextMessage = "Task draft is ready for normal-form review."; }
        if (event.type === "backlog_proposal" && !event.stale) { setBacklogProposal({ proposal: event.proposal, handoff: event.handoff }); nextMessage = "Backlog handoff is ready to copy."; }
      }
      if (nextAnswer) { setAnswer(nextAnswer); setStale(nextStale); persist(mode, nextAnswer); }
      if (nextProposal) setProposal(nextProposal);
      if (nextMessage) setMessage(nextMessage);
      if (!nextAnswer && !nextProposal && !nextMessage) setMessage("The run ended before a complete result was received. Try again.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Assistant request failed. Try again.");
    } finally { setRunning(false); }
  };

  const submit = () => {
    const trimmed = question.trim();
    if (!trimmed) { setMessage("Enter a question before asking Companion."); return; }
    void consume({ intent: "ask", project_slug: projectSlug, question: trimmed, mode, selected_optional_source_ids: selectedOptionalSourceIds, expected_manifest_digest: entry.manifest_digest });
  };

  const respondToGate = (intent: "inspect_source" | "answer_without_source") => {
    if (!proposal) return;
    void consume({ intent, project_slug: projectSlug, gate_id: proposal.gate_id, question: question.trim(), expected_manifest_digest: entry.manifest_digest });
  };
  const draftRecommendation = (candidate: ManagementRecommendation, intent: "draft_task" | "draft_backlog") => void consume({ intent, project_slug: projectSlug, candidate: candidate as any, mode, expected_manifest_digest: entry.manifest_digest });

  return <>
    <button type="button" className="btn" onClick={() => setOpen(true)}>Management assistant</button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="assistant-sheet" onOpenAutoFocus={(event) => { event.preventDefault(); headingRef.current?.focus(); }}>
        <SheetHeader className="assistant-sheet__header">
          <SheetTitle ref={headingRef} tabIndex={-1}>Management assistant</SheetTitle>
          <SheetDescription>Fresh, project-scoped analysis. It does not retain a conversation.</SheetDescription>
        </SheetHeader>
        <div className="assistant-sheet__body">
          <AssistantContextReceiptView receipt={entry.receipt} />
          {entry.receipt.sources.some((source) => source.optional) && <fieldset className="assistant-source-selection" disabled={running}>
            <legend>Optional documents</legend>
            {entry.receipt.sources.filter((source) => source.optional).map((source) => <label key={source.source_id}>
              <input type="checkbox" checked={selectedOptionalSourceIds.includes(source.source_id)} onChange={(event) => setSelectedOptionalSourceIds((selected) => event.target.checked ? [...selected, source.source_id] : selected.filter((id) => id !== source.source_id))} />
              <code>{source.path}</code>
            </label>)}
          </fieldset>}
          {answer && <AssistantAnswer answer={answer} stale={stale} onUseTaskDraft={(candidate) => draftRecommendation(candidate, "draft_task")} onDraftBacklog={(candidate) => draftRecommendation(candidate, "draft_backlog")} />}
          {backlogProposal && <section className="assistant-source-gate" aria-label="Repository-agent Backlog handoff"><h3>Copy-only Backlog handoff</h3><textarea aria-label="Repository-agent handoff" readOnly value={backlogProposal.handoff} rows={10} /><button className="btn" type="button" onClick={() => void navigator.clipboard?.writeText(backlogProposal.handoff)}>Copy repository-agent handoff</button></section>}
          {proposal && <AssistantSourceGate proposal={proposal} disabled={running} onInspect={() => respondToGate("inspect_source")} onDecline={() => respondToGate("answer_without_source")} />}
          {message && <p className="assistant-message" role="status">{message}</p>}
        </div>
        <div className="assistant-composer">
          <fieldset disabled={running}>
            <legend>Analysis depth</legend>
            <label><input type="radio" name={`assistant-mode-${projectSlug}`} checked={mode === "standard"} onChange={() => { setMode("standard"); persist("standard", answer); }} /> Standard</label>
            <label><input type="radio" name={`assistant-mode-${projectSlug}`} checked={mode === "deep"} onChange={() => { setMode("deep"); persist("deep", answer); }} /> Deep</label>
          </fieldset>
          <label htmlFor={`assistant-question-${projectSlug}`}>Ask management assistant</label>
          <textarea id={`assistant-question-${projectSlug}`} value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2_000} rows={3} placeholder="Ask about the current project evidence." />
          <div className="assistant-composer__footer"><span aria-live="polite">{running ? "Companion is preparing a bounded run…" : "One request at a time."}</span><button type="button" className="btn btn--primary" onClick={submit} disabled={running}>Ask Companion</button></div>
        </div>
      </SheetContent>
    </Sheet>
  </>;
}
