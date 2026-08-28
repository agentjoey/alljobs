import { validateProjectRelations } from "../domain/relations";
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
  PlanningProvider,
  SourceProvenance
} from "./contracts";
import type { GitRunner } from "./git-runner";

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
      return {
        project: project.slug,
        revision: "unknown",
        fetchedAt,
        freshness: "unavailable",
        roadmap: [],
        backlog: [],
        tasks: [],
        issues: [
          {
            scope: "document",
            code: "MISSING_REPOSITORY_PATH",
            sourcePath: "",
            message: `No mirror or workspace path available for project "${project.slug}"`
          }
        ],
        provenance: []
      };
    }

    // Get current revision commit hash (`--end-of-options`: ref may be
    // user-influenced and must not be parsed as a git option)
    const revResult = await this.gitRunner.run(["rev-parse", "--verify", "--end-of-options", ref], { cwd });
    const revision = revResult.exitCode === 0 ? revResult.stdout.trim() : "unknown";

    if (revResult.exitCode !== 0) {
      return {
        project: project.slug,
        revision: "unknown",
        fetchedAt,
        freshness: "unavailable",
        roadmap: [],
        backlog: [],
        tasks: [],
        issues: [
          {
            scope: "document",
            code: "GIT_REV_PARSE_FAILED",
            sourcePath: cwd,
            message: `Failed to resolve ref "${ref}" in "${cwd}": ${revResult.stderr}`
          }
        ],
        provenance: []
      };
    }

    const issues: ProofIssue[] = [];
    const provenance: SourceProvenance[] = [];

    // Read docs/ROADMAP.md from git tree
    let roadmapItems: RoadmapItem[] = [];
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
    } else {
      issues.push({
        scope: "document",
        code: "ROADMAP_DOCUMENT_NOT_FOUND",
        sourcePath: "docs/ROADMAP.md",
        message: `Could not read docs/ROADMAP.md from revision ${revision.slice(0, 7)}`
      });
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
    } else {
      issues.push({
        scope: "document",
        code: "BACKLOG_DOCUMENT_NOT_FOUND",
        sourcePath: "docs/BACKLOG.md",
        message: `Could not read docs/BACKLOG.md from revision ${revision.slice(0, 7)}`
      });
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
      provenance
    };
  }
}
