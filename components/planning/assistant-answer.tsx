import type { ManagementAnswer, ManagementRecommendation } from "@/lib/assistant/contracts";

export function AssistantAnswer({ answer, stale = false, onUseTaskDraft, onDraftBacklog }: { answer: ManagementAnswer; stale?: boolean; onUseTaskDraft?: (candidate: ManagementRecommendation) => void; onDraftBacklog?: (candidate: ManagementRecommendation) => void }) {
  return (
    <section className="assistant-output" aria-label="Companion output">
      <div className="assistant-output__header">
        <strong>Companion output</strong>
        <span>{stale ? "Stale — refresh context" : "Bounded run"}</span>
      </div>
      <p className="assistant-output__answer">{answer.direct_answer}</p>
      {answer.confirmed_facts.length > 0 && <OutputList title="Confirmed facts" items={answer.confirmed_facts.map((fact) => fact.text)} />}
      {answer.inferences.length > 0 && <OutputList title="Inferences" items={answer.inferences.map((inference) => inference.text)} />}
      {answer.unknowns.length > 0 && <OutputList title="Unknowns" items={answer.unknowns} />}
      {answer.questions.length > 0 && <OutputList title="Questions" items={answer.questions} />}
      {answer.recommendations.length > 0 && <div className="assistant-output__section"><h3>Recommendation</h3>{answer.recommendations.map((recommendation) => <div key={recommendation.id}><p>{recommendation.title}: {recommendation.rationale}</p>{!stale && recommendation.candidate_kind === "task" && <button className="btn" type="button" onClick={() => onUseTaskDraft?.(recommendation)}>Use as Task draft</button>}{!stale && recommendation.candidate_kind === "backlog" && <button className="btn" type="button" onClick={() => onDraftBacklog?.(recommendation)}>Draft Backlog proposal</button>}</div>)}</div>}
    </section>
  );
}

function OutputList({ title, items }: { title: string; items: string[] }) {
  return <div className="assistant-output__section"><h3>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}
