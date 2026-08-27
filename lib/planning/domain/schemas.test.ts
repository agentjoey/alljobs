import { describe, expect, it } from "vitest";
import {
  parseBacklogItem,
  parseProjectRegistry,
  parseRoadmapItem,
  parseTask
} from "./schemas";

describe("domain schemas", () => {
  describe("projectRegistrySchema", () => {
    it("parses valid code project", () => {
      const p = parseProjectRegistry({
        slug: "alljobs",
        name: "AllJobs",
        type: "code",
        work_modes: ["implementation", "operations"],
        git_remote: "git@github.com:agentjoey/alljobs.git",
        git_branch: "main"
      });
      expect(p.slug).toBe("alljobs");
      expect(p.type).toBe("code");
      expect(p.archived).toBe(false);
    });

    it("rejects uppercase or invalid slug", () => {
      expect(() => parseProjectRegistry({
        slug: "AllJobs_Invalid",
        name: "AllJobs",
        type: "code",
        work_modes: ["implementation"]
      })).toThrowError(/Slug must contain only lowercase/);
    });

    it("rejects empty work_modes", () => {
      expect(() => parseProjectRegistry({
        slug: "sea-launch",
        name: "SEA Launch",
        type: "business",
        work_modes: []
      })).toThrowError(/at least one work_mode/);
    });
  });

  describe("roadmapItemSchema", () => {
    it("parses valid Phase and Milestone items", () => {
      const phase = parseRoadmapItem({
        id: "phase-1",
        title: "Planning Core V1",
        kind: "phase",
        status: "active",
        order: 10,
        focus: "primary"
      });
      expect(phase.id).toBe("phase-1");
      expect(phase.kind).toBe("phase");

      const milestone = parseRoadmapItem({
        id: "m-02",
        title: "Partner Validation",
        kind: "milestone",
        status: "planned",
        order: 20
      });
      expect(milestone.id).toBe("m-02");
      expect(milestone.kind).toBe("milestone");
    });
  });

  describe("backlogItemSchema", () => {
    it("parses implementation backlog item with phase", () => {
      const item = parseBacklogItem({
        id: "AJ-B-001",
        title: "Parser engine",
        work_mode: "implementation",
        phase: "phase-1",
        status: "ready",
        priority: "P0",
        dependencies: []
      });
      expect(item.id).toBe("AJ-B-001");
      expect(item.phase).toBe("phase-1");
    });

    it("rejects implementation backlog item without phase", () => {
      expect(() => parseBacklogItem({
        id: "AJ-B-002",
        title: "Orphaned item",
        work_mode: "implementation",
        status: "ready",
        priority: "P1"
      })).toThrowError(/Implementation backlog items must belong to a Phase/);
    });

    it("allows operational backlog item without phase", () => {
      const item = parseBacklogItem({
        id: "AJ-B-003",
        title: "Rotate token",
        work_mode: "operations",
        status: "idea",
        priority: "P2"
      });
      expect(item.id).toBe("AJ-B-003");
      expect(item.phase).toBeUndefined();
    });
  });

  describe("taskSchema", () => {
    it("parses backlog-bound task", () => {
      const task = parseTask({
        id: "AJ-T-041",
        title: "Implement registration check",
        project: "alljobs",
        status: "doing",
        backlog: "AJ-B-001",
        source: { provider: "native" }
      });
      expect(task.id).toBe("AJ-T-041");
      expect(task.backlog).toBe("AJ-B-001");
    });

    it("rejects mutually exclusive backlog and roadmap_item", () => {
      expect(() => parseTask({
        id: "AJ-T-042",
        title: "Conflicting relations",
        project: "alljobs",
        status: "todo",
        backlog: "AJ-B-001",
        roadmap_item: "phase-1",
        source: { provider: "native" }
      })).toThrowError(/mutually exclusive/);
    });

    it("rejects blocked status without blocked_reason", () => {
      expect(() => parseTask({
        id: "AJ-T-043",
        title: "Blocked item",
        project: "alljobs",
        status: "blocked",
        work_mode: "operations",
        source: { provider: "native" }
      })).toThrowError(/require a blocked_reason/);
    });

    it("accepts blocked status with blocked_reason", () => {
      const task = parseTask({
        id: "AJ-T-043",
        title: "Blocked item",
        project: "alljobs",
        status: "blocked",
        blocked_reason: "Waiting for API credentials",
        work_mode: "operations",
        source: { provider: "native" }
      });
      expect(task.status).toBe("blocked");
      expect(task.blocked_reason).toBe("Waiting for API credentials");
    });

    it("rejects project-level task without work_mode", () => {
      expect(() => parseTask({
        id: "AJ-T-044",
        title: "Unbound task",
        project: "alljobs",
        status: "todo",
        source: { provider: "native" }
      })).toThrowError(/declare work_mode explicitly/);
    });
  });
});
