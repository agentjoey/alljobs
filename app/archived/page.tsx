import { StatePanel } from "@/components/planning/state-panel";
import { NativePlanningStore } from "@/lib/planning/native/store";
import { RestoreProjectControl } from "./restore-project-control";

export const dynamic = "force-dynamic";

export default async function ArchivedPage() {
  const store = new NativePlanningStore();
  const projects = await store.listProjects();
  const archivedProjects = projects.filter(p => p.archived);

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Archived Projects</h1>
          <p className="view-subtitle">Inactive projects retained in history. Native mutations and provider refresh are stopped.</p>
        </div>
      </div>

      {archivedProjects.length === 0 ? (
        <StatePanel
          title="No archived projects"
          description="All registered projects are currently active."
          actionText="Browse Active Projects"
          actionHref="/projects"
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {archivedProjects.map(p => (
            <div
              key={p.slug}
              style={{
                background: "var(--paper-raised)",
                border: "1px solid var(--hairline)",
                borderRadius: "var(--radius-md)",
                padding: "16px 20px"
              }}
            >
              <RestoreProjectControl slug={p.slug}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <strong style={{ fontSize: "16px", color: "var(--ink)" }}>{p.name}</strong>
                    <span className="badge badge--blocked">ARCHIVED</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--ink-faint)", marginTop: "4px" }}>
                    Slug: {p.slug} · Type: {p.type}
                  </div>
                </div>
              </RestoreProjectControl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
