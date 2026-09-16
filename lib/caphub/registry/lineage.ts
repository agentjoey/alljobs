import type { Pool } from "pg";
import { registryRecordIdSchema } from "./schemas";
import type { RegistryLineageEdge } from "./types";
import { RegistryError, mapRegistryDatabaseError } from "./postgres/database";
import { lineageRowToDomain } from "./postgres/records";

export interface ReleaseLineageNode {
  id: string;
  kind: string;
  version: number;
  digest: string;
  depth: number;
}

export interface ReleaseLineageTrace {
  releaseId: string;
  nodes: ReleaseLineageNode[];
  edges: RegistryLineageEdge[];
  captureIds: string[];
  evidenceIds: string[];
  candidateIds: string[];
  decisionIds: string[];
  truncated: boolean;
}

interface NodeRow {
  id: string;
  kind: string;
  version: number;
  digest: string;
  depth: number;
  path: string[];
}

interface LineageRow {
  from_node_id: string;
  from_kind: RegistryLineageEdge["from_kind"];
  from_version: number;
  from_digest: string;
  relationship: RegistryLineageEdge["relationship"];
  to_node_id: string;
  to_kind: RegistryLineageEdge["to_kind"];
  to_version: number;
  to_digest: string;
  created_at: Date | string;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export async function traceReleaseLineage(
  pool: Pool,
  releaseId: string,
  options: { maxDepth?: number } = {}
): Promise<ReleaseLineageTrace> {
  const maxDepth = options.maxDepth ?? 16;
  if (!registryRecordIdSchema.safeParse(releaseId).success
    || !releaseId.startsWith("rel_")
    || !Number.isInteger(maxDepth)
    || maxDepth < 1
    || maxDepth > 16) {
    throw new RegistryError("LINEAGE_CONFLICT");
  }

  try {
    const ancestry = await pool.query<NodeRow>(`
      WITH RECURSIVE ancestry AS (
        SELECT n.node_id AS id, n.node_kind AS kind, n.node_version AS version,
               n.node_digest AS digest, 0 AS depth, ARRAY[n.node_id]::text[] AS path
        FROM caphub.lineage_nodes n
        JOIN caphub.registry_records r
          ON r.record_id = n.node_id AND r.current_version = n.node_version
        WHERE n.node_id = $1 AND n.node_kind = 'release'
        UNION ALL
        SELECT e.from_node_id, e.from_kind, e.from_version, e.from_digest,
               ancestry.depth + 1, ancestry.path || e.from_node_id
        FROM ancestry
        JOIN caphub.registry_lineage e
          ON e.to_node_id = ancestry.id AND e.to_version = ancestry.version
        WHERE ancestry.depth < $2 AND NOT e.from_node_id = ANY(ancestry.path)
      )
      SELECT id, kind, version, digest, min(depth)::int AS depth,
             (array_agg(path ORDER BY depth))[1] AS path
      FROM ancestry
      GROUP BY id, kind, version, digest
      ORDER BY min(depth), kind, id, version
    `, [releaseId, maxDepth]);
    if (ancestry.rowCount === 0) throw new RegistryError("LINEAGE_CONFLICT");

    const nodes: ReleaseLineageNode[] = ancestry.rows.map(({ path: _path, ...node }) => node);
    const identityKeys = new Set(nodes.map((node) => `${node.id}:${node.version}`));
    const mainEdges = await pool.query<LineageRow>(`
      WITH selected AS (
        SELECT id, version FROM unnest($1::text[], $2::int[]) AS item(id, version)
      )
      SELECT e.* FROM caphub.registry_lineage e
      JOIN selected source ON source.id = e.from_node_id AND source.version = e.from_version
      JOIN selected target ON target.id = e.to_node_id AND target.version = e.to_version
      ORDER BY e.from_node_id, e.from_version, e.relationship, e.to_node_id, e.to_version
    `, [nodes.map((node) => node.id), nodes.map((node) => node.version)]);

    const packetNodes = nodes.filter((node) => node.kind === "review_packet");
    const attached = packetNodes.length === 0 ? { rows: [] as LineageRow[] } : await pool.query<LineageRow>(`
      WITH selected AS (
        SELECT id, version FROM unnest($1::text[], $2::int[]) AS item(id, version)
      )
      SELECT e.* FROM caphub.registry_lineage e
      JOIN selected source ON source.id = e.from_node_id AND source.version = e.from_version
      WHERE e.to_kind IN ('evidence', 'entity', 'claim')
      ORDER BY e.to_kind, e.to_node_id, e.to_version
    `, [packetNodes.map((node) => node.id), packetNodes.map((node) => node.version)]);

    for (const row of attached.rows) {
      const key = `${row.to_node_id}:${row.to_version}`;
      if (!identityKeys.has(key)) {
        nodes.push({ id: row.to_node_id, kind: row.to_kind, version: row.to_version, digest: row.to_digest, depth: maxDepth + 1 });
        identityKeys.add(key);
      }
    }

    const candidates = nodes.filter((node) => node.kind === "candidate");
    const decisions = candidates.length === 0 ? { rows: [] as Array<{
      request_id: string; request_digest: string; decision_id: string; decision_digest: string;
    }> } : await pool.query<{
      request_id: string; request_digest: string; decision_id: string; decision_digest: string;
    }>(`
      WITH selected AS (
        SELECT id, version, digest
        FROM unnest($1::text[], $2::int[], $3::text[]) AS item(id, version, digest)
      )
      SELECT q.request_id, q.subject_digest AS request_digest,
             d.decision_id, d.confirmation_digest AS decision_digest
      FROM selected
      JOIN caphub.review_requests q
        ON q.subject_id = selected.id
       AND q.subject_version = selected.version
       AND q.subject_digest = selected.digest
      JOIN caphub.review_decisions d ON d.request_id = q.request_id
      WHERE (q.state = 'APPROVED' AND d.action = 'approve')
         OR (q.state = 'REJECTED' AND d.action = 'reject')
         OR (q.state = 'REVOKED' AND d.action = 'revoke')
      ORDER BY d.decision_id
    `, [
      candidates.map((node) => node.id),
      candidates.map((node) => node.version),
      candidates.map((node) => node.digest)
    ]);

    for (const row of decisions.rows) {
      const requestKey = `${row.request_id}:1`;
      if (!identityKeys.has(requestKey)) {
        nodes.push({ id: row.request_id, kind: "review_request", version: 1, digest: row.request_digest, depth: maxDepth + 1 });
        identityKeys.add(requestKey);
      }
      const decisionKey = `${row.decision_id}:1`;
      if (!identityKeys.has(decisionKey)) {
        nodes.push({ id: row.decision_id, kind: "review_decision", version: 1, digest: row.decision_digest, depth: maxDepth + 2 });
        identityKeys.add(decisionKey);
      }
    }

    const reviewEdges = decisions.rows.length === 0 ? { rows: [] as LineageRow[] } : await pool.query<LineageRow>(`
      SELECT * FROM caphub.registry_lineage
      WHERE from_node_id = ANY($1::text[])
        AND to_node_id = ANY($2::text[])
        AND relationship = 'decided_by'
      ORDER BY from_node_id, to_node_id
    `, [
      decisions.rows.map((row) => row.request_id),
      decisions.rows.map((row) => row.decision_id)
    ]);

    const truncatedNodes = ancestry.rows.filter((node) => node.depth === maxDepth);
    const truncated = truncatedNodes.length > 0 && (await pool.query<{ present: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM caphub.registry_lineage e
        WHERE (e.to_node_id, e.to_version) IN (
          SELECT id, version FROM unnest($1::text[], $2::int[]) AS selected(id, version)
        )
      ) AS present
    `, [truncatedNodes.map((node) => node.id), truncatedNodes.map((node) => node.version)])).rows[0]?.present === true;

    const edges = [...mainEdges.rows, ...attached.rows, ...reviewEdges.rows]
      .map(lineageRowToDomain)
      .filter((edge, index, all) => all.findIndex((candidate) =>
        candidate.from_record_id === edge.from_record_id
        && candidate.from_version === edge.from_version
        && candidate.relationship === edge.relationship
        && candidate.to_record_id === edge.to_record_id
        && candidate.to_version === edge.to_version
      ) === index)
      .sort((left, right) => canonicalEdgeKey(left).localeCompare(canonicalEdgeKey(right)));
    nodes.sort((left, right) => left.depth - right.depth || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));

    return {
      releaseId,
      nodes,
      edges,
      captureIds: uniqueSorted(nodes.filter((node) => node.kind === "capture").map((node) => node.id)),
      evidenceIds: uniqueSorted(nodes.filter((node) => node.kind === "evidence").map((node) => node.id)),
      candidateIds: uniqueSorted(nodes.filter((node) => node.kind === "candidate").map((node) => node.id)),
      decisionIds: uniqueSorted(nodes.filter((node) => node.kind === "review_decision").map((node) => node.id)),
      truncated
    };
  } catch (error) {
    throw mapRegistryDatabaseError(error, "LINEAGE_CONFLICT");
  }
}

function canonicalEdgeKey(edge: RegistryLineageEdge): string {
  return `${edge.from_record_id}:${edge.from_version}:${edge.relationship}:${edge.to_record_id}:${edge.to_version}`;
}
