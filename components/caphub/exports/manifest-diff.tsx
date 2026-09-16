export interface ManifestDiffEntryView {
  path: string;
  action: "create" | "update" | "delete" | string;
  hunks: string;
}

const DIFF_DISPLAY_LIMIT = 4_096;

export function ManifestDiff({ entries, label }: { entries: ManifestDiffEntryView[]; label: string }) {
  if (entries.length === 0) {
    return <p>No file-level differences are available for this preview.</p>;
  }
  return (
    <ol aria-label={label}>
      {entries.map((entry) => {
        const bounded = entry.hunks.length > DIFF_DISPLAY_LIMIT
          ? `${entry.hunks.slice(0, DIFF_DISPLAY_LIMIT)}\n… diff display bounded …`
          : entry.hunks;
        return (
          <li key={`${entry.action}:${entry.path}`}>
            <strong>{entry.action}</strong> <code>{entry.path}</code>
            {entry.hunks ? <pre>{bounded}</pre> : null}
          </li>
        );
      })}
    </ol>
  );
}
