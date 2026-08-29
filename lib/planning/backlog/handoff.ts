import type { Priority } from "../domain/types";

export interface NewBacklogProposalInput {
  projectSlug: string;
  title: string;
  problem: string;
  expectedOutcome: string;
  suggestedPhase?: string;
  suggestedPriority?: Priority;
  doneWhen?: string;
  notes?: string;
  headRevision?: string;
  backlogDigest?: string;
}

function optionalSection(heading: string, value: string | undefined) {
  return value ? `\n## ${heading}\n${value}\n` : "";
}

export function buildRepoAgentBacklogProposal(input: NewBacklogProposalInput): string {
  const sourceFacts = [
    input.headRevision ? `- HEAD revision: ${input.headRevision}` : undefined,
    input.backlogDigest ? `- Backlog digest: ${input.backlogDigest}` : undefined
  ].filter(Boolean).join("\n");
  const suggestions = [
    input.suggestedPhase ? `- Suggested Phase: ${input.suggestedPhase}` : undefined,
    input.suggestedPriority ? `- Suggested priority: ${input.suggestedPriority}` : undefined,
    input.doneWhen ? `- Suggested Done When: ${input.doneWhen}` : undefined
  ].filter(Boolean).join("\n");

  return `# Backlog change proposal — ${input.projectSlug}\n\n` +
    `## Request\n${input.title}\n\n${input.problem}\n\n` +
    `## Expected outcome\n${input.expectedOutcome}\n` +
    optionalSection("Source context", sourceFacts) +
    optionalSection("Suggested planning fields", suggestions) +
    optionalSection("Notes", input.notes) +
    `\n## Repository-agent instructions\n` +
    `1. Inspect the current code, architecture, ROADMAP, and BACKLOG.\n` +
    `2. Confirm Phase, dependencies, priority, and Done When.\n` +
    `3. Choose a stable item ID and edit docs/BACKLOG.md.\n` +
    `4. Run the repository planning validation and report the diff and commit.\n\n` +
    `## Boundary\nThis is a copy-only proposal. AllJobs did not edit the repository, write a Backlog item, start an agent, or perform a Git operation.\n`;
}
