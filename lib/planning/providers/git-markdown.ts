import { validateProjectRelations } from "../domain/relations";
import { triagePlanningDocument } from "../document-triage";
import type {
  BacklogItem,
  ProjectRegistryEntry,
  ProofIssue,
  RoadmapItem,
  Task
} from "../domain/types";
import { parseBacklogDocument } from "../markdown/backlog";
import { parseRoadmapDocument } from "../markdown/roadmap";
import { computeDigest } from "../native/digest";
import type {
  ExternalProjection,
  DocumentTriage,
  PlanningProvider,
  SourceProvenance
} from "./contracts";
import type { GitRunner } from "./git-runner";

function unavailableDocuments(project: ProjectRegistryEntry, issue: ProofIssue): DocumentTriage[] {
  return [
    ...(project.work_modes.includes("implementation") ? [triagePlanningDocument({
      document: "roadmap" as const,
      sourcePath: "docs/ROADMAP.md",
      parserIssues: [issue],
      canonicalItemCount: 0,
      unavailable: true
    })] : []),
    triagePlanningDocument({
      document: "backlog",
      sourcePath: "docs/BACKLOG.md",
      parserIssues: [issue],
      canonicalItemCount: 0,
      unavailable: true
    })
  ];
}

export class GitMarkdownProvider implements PlanningProvider {
  readonly name = "git-markdown";

  constructor(private readonly gitRunner: GitRunner) {}

  async projectRoadmap(
    project: ProjectRegistryEntry,
    options: { mirrorPath?: string; trustedPath?: string; ref?: string } = {}
  ): Promise<ExternalProjection> {
    const cwd = options.mirrorPath || options.trustedPath;
    const ref = options.ref || project.git_branch || "HEAD";
    const fetchedAt = new Date().toISOString();

    if (!cwd) {
      const issue: ProofIssue = {
        scope: "document",
        code: "MISSING_REPOSITORY_PATH",
        sourcePath: "",
        message: `No mirror or workspace path available for project "${project.slug}"`
      };
      return {
        project: project.slug,
        revision: "unknown",
        fetchedAt,
        freshness: "unavailable",
        roadmap: [],
        backlog: [],
        tasks: [],
        issues: [issue],
        provenance: [],
        documents: unavailableDocuments(project, issue)
      };
    }

    // Get current revision commit hash (`--end-of-options`: ref may be
    // user-influenced and must not be parsed as a git option)
    const revResult = await this.gitRunner.run(["rev-parse", "--verify", "--end-of-options", ref], { cwd });
    const revision = revResult.exitCode === 0 ? revResult.stdout.trim() : "unknown";

    if (revResult.exitCode !== 0) {
      const issue: ProofIssue = {
        scope: "document",
        code: "GIT_REV_PARSE_FAILED",
        sourcePath: cwd,
        message: `Failed to resolve ref "${ref}" in "${cwd}": ${revResult.stderr}`
      };
      return {
        project: project.slug,
        revision: "unknown",
        fetchedAt,
        freshness: "unavailable",
        roadmap: [],
        backlog: [],
        tasks: [],
        issues: [issue],
        provenance: [],
        documents: unavailableDocuments(project, issue)
      };
    }

    const issues: ProofIssue[] = [];
    const provenance: SourceProvenance[] = [];
    const documents: DocumentTriage[] = [];

    // Read docs/ROADMAP.md from git tree
    let roadmapItems: RoadmapItem[] = [];
    if (project.work_modes.includes("implementation")) {
      const roadmapResult = await this.gitRunner.run(
        ["show", "--end-of-options", `${ref}:docs/ROADMAP.md`],
        { cwd }
      );

      if (roadmapResult.exitCode === 0) {
        const content = roadmapResult.stdout;
        const digest = computeDigest(content);
        provenance.push({
          provider: this.name,
          location: "docs/ROADMAP.md",
          revision,
          digest,
          fetchedAt
        });

        const parsed = parseRoadmapDocument(content, "docs/ROADMAP.md", "phase");
        roadmapItems = parsed.valid;
        issues.push(...parsed.issues);
        documents.push(triagePlanningDocument({
          document: "roadmap",
          sourcePath: "docs/ROADMAP.md",
          content,
          digest,
          revision,
          parserIssues: parsed.issues,
          canonicalItemCount: parsed.valid.length
        }));
      } else {
        const issue: ProofIssue = {
          scope: "document",
          code: "ROADMAP_DOCUMENT_NOT_FOUND",
          sourcePath: "docs/ROADMAP.md",
          message: `Could not read docs/ROADMAP.md from revision ${revision.slice(0, 7)}`
        };
        issues.push(issue);
        documents.push(triagePlanningDocument({
          document: "roadmap",
          sourcePath: "docs/ROADMAP.md",
          revision,
          parserIssues: [issue],
          canonicalItemCount: 0,
          missing: true
        }));
      }
    }

    // Read docs/BACKLOG.md from git tree
    let backlogItems: BacklogItem[] = [];
    const backlogResult = await this.gitRunner.run(
      ["show", "--end-of-options", `${ref}:docs/BACKLOG.md`],
      { cwd }
    );

    if (backlogResult.exitCode === 0) {
      const content = backlogResult.stdout;
      const digest = computeDigest(content);
      provenance.push({
        provider: this.name,
        location: "docs/BACKLOG.md",
        revision,
        digest,
        fetchedAt
      });

      const parsed = parseBacklogDocument(content, "docs/BACKLOG.md");
      backlogItems = parsed.valid;
      issues.push(...parsed.issues);
      documents.push(triagePlanningDocument({
        document: "backlog",
        sourcePath: "docs/BACKLOG.md",
        content,
        digest,
        revision,
        parserIssues: parsed.issues,
        canonicalItemCount: parsed.valid.length
      }));
    } else {
      const issue: ProofIssue = {
        scope: "document",
        code: "BACKLOG_DOCUMENT_NOT_FOUND",
        sourcePath: "docs/BACKLOG.md",
        message: `Could not read docs/BACKLOG.md from revision ${revision.slice(0, 7)}`
      };
      issues.push(issue);
      documents.push(triagePlanningDocument({
        document: "backlog",
        sourcePath: "docs/BACKLOG.md",
        revision,
        parserIssues: [issue],
        canonicalItemCount: 0,
        missing: true
      }));
    }

    // Validate project relations
    const relationResult = validateProjectRelations({
      project,
      roadmapItems,
      backlogItems,
      tasks: [],
      sourcePath: `git:${revision.slice(0, 7)}`
    });

    issues.push(...relationResult.issues);

    return {
      project: project.slug,
      revision,
      fetchedAt,
      freshness: "fresh",
      roadmap: relationResult.valid[0]?.roadmapItems || roadmapItems,
      backlog: relationResult.valid[0]?.backlogItems || backlogItems,
      tasks: [],
      issues,
      provenance,
      documents
    };
  }
}
