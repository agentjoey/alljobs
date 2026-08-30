# AllJobs Backlog

Canonical implementation backlog for the AllJobs repository. The Roadmap at
`docs/ROADMAP.md` remains the phase-level source of intent; this file holds
the executable, priority-ordered items within those phases.

## AJ-B-001: Backlog Control

```yaml alljobs
id: AJ-B-001
work_mode: implementation
phase: R1
status: done
priority: P0
rank: 100
dependencies: []
done_when: The approved R1 Backlog Control delivery is live without giving AllJobs authority to create or apply repository Backlog changes.
```

The completed R1 delivery establishes safe priority and rank proposals for
existing repository-owned Backlog items.

## AJ-B-002: Planning and Management Assistant

```yaml alljobs
id: AJ-B-002
work_mode: implementation
phase: R2
status: ready
priority: P0
rank: 100
dependencies:
  - AJ-B-001
done_when: An owner-invoked assistant returns attributable planning answers and repository-agent handoffs without modifying a repository.
```

## AJ-B-003: Agent Queue, Work State, and Backlog Companion

```yaml alljobs
id: AJ-B-003
work_mode: implementation
phase: R3
status: idea
priority: P1
rank: 100
dependencies:
  - AJ-B-002
done_when: Eligible work and running-agent state are presented as a trustworthy projection without AllJobs starting or controlling coding agents.
```

## AJ-B-004: UI Consolidation

```yaml alljobs
id: AJ-B-004
work_mode: implementation
phase: R4
status: idea
priority: P1
rank: 100
dependencies:
  - AJ-B-003
done_when: Backlog and Task provide the primary, non-duplicated planning workflow while retaining the Paper Workbench direction.
```

## AJ-B-005: Console Dashboard

```yaml alljobs
id: AJ-B-005
work_mode: implementation
phase: R5
status: idea
priority: P1
rank: 100
dependencies:
  - AJ-B-004
done_when: The owner can see focus, planning health, agent state, and reported system health from one daily entry point.
```

## AJ-B-006: Multi-device Project Identity

```yaml alljobs
id: AJ-B-006
work_mode: implementation
phase: R6
status: idea
priority: P2
rank: 100
dependencies:
  - AJ-B-005
done_when: One repository can be represented by one Project across explicitly registered device workspaces with one controlled write location.
```

## AJ-B-007: Operations and KPI

```yaml alljobs
id: AJ-B-007
work_mode: implementation
phase: R7
status: idea
priority: P2
rank: 100
dependencies:
  - AJ-B-006
done_when: Proven business and operational workflows can record simple manual outcome measures without speculative connectors.
```

## AJ-B-008: Reliability and Long-term Maintenance

```yaml alljobs
id: AJ-B-008
work_mode: implementation
phase: R8
status: idea
priority: P2
rank: 100
dependencies:
  - AJ-B-007
done_when: AllJobs has evidenced recovery, retention, capacity, and low-maintenance safeguards for real planning data.
```
