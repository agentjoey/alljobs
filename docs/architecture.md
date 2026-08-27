# Planning Core V1 — Architecture Specification

## Overview

AllJobs 是单主模式下的个人多项目规划控制平面（Personal Planning Control Plane），核心管理三层实体体系：
**Project → Roadmap / Milestones → Backlog / Task**

## Federated Custody Model

```
┌─────────────────────────────────────────────────────────────┐
│                    AllJobs Control Host                     │
│                                                             │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │   AllJobs-Native      │       │ External Repo Mirror  │  │
│  │   Business Projects   │       │ Code Projects (Local) │  │
│  │  (data/projects/*.md) │       │  (Read-Only Projection│  │
│  │  - Native Milestones  │       │  - docs/ROADMAP.md    │  │
│  │  - Native Tasks       │       │  - docs/BACKLOG.md)   │  │
│  │  [SOLID / WRITABLE]   │       │  [HATCH / READ-ONLY]  │  │
│  └───────────┬───────────┘       └───────────┬───────────┘  │
│              │                               │              │
│              ▼                               ▼              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │        Projection Engine & Provenance Tracker         │  │
│  │  - Exact Git Revisions (e.g. 7bc40e1)                 │  │
│  │  - Document Hash Digests (SHA-256)                    │  │
│  │  - ProofIssue Isolation (Per-item degradation)        │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │                              │
│                              ▼                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │       Paper Workbench Next.js App (127.0.0.1:3456)     │  │
│  │  - Portfolio Workbench Dashboard                      │  │
│  │  - Project Registry & Details (Vertical Timelines)    │  │
│  │  - Cross-Project Task Ledger & Backlog Drawers        │  │
│  │  - Human Gate Confirmation Boundary                   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 1. Code Projects (External Git-Markdown Projection)
- **Authority**: 外部代码仓库内的 `docs/ROADMAP.md` 与 `docs/BACKLOG.md` 为唯一事实源。
- **Read-Only**: AllJobs 只通过本地 Git mirror 做只读投影，绝不修改外部仓库文件。
- **ProofIssue Isolation**: 某一条 Backlog 格式异常时，仅在该条目标记 ProofIssue，不影响同文件其它健康条目的展示。

### 2. Business Projects (AllJobs-Native Markdown)
- **Authority**: AllJobs 直接管理业务项目的 Roadmap Milestones 与 Tasks。
- **Storage**: 单一 Markdown 文件保管于 `data/projects/<slug>.md`。
- **Atomic Writes & Digest Lock**: 写前比对期望 Digest，两阶段校验，通过原子重命名保证不损坏文件。

### 3. Human Gate Safeguards
- 候选项目注册、归档、恢复及原生写入均强制经过两阶段流程（Inspect → Review Proposal & Digest → Confirm Human Gate）。
- 执行前做全量重新校验，若内容发生变动则返回 `STALE_STATE` 并阻断写入。
