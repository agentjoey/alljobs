CREATE INDEX registry_versions_kind_created_idx
  ON caphub.registry_versions (kind, created_at DESC);
CREATE INDEX registry_lineage_from_idx
  ON caphub.registry_lineage (from_node_id, from_version, relationship);
CREATE INDEX registry_lineage_to_idx
  ON caphub.registry_lineage (to_node_id, to_version, relationship);
CREATE INDEX review_requests_queue_idx
  ON caphub.review_requests (state, created_at, review_kind);
CREATE INDEX review_decisions_request_idx
  ON caphub.review_decisions (request_id, recorded_at DESC);
CREATE INDEX audit_events_subject_idx
  ON caphub.audit_events (subject_id, subject_version, occurred_at DESC);

CREATE VIEW caphub.review_queue
WITH (security_barrier = true)
AS
SELECT
  request_id,
  review_kind,
  subject_kind,
  subject_id,
  subject_version,
  subject_digest,
  lock_version,
  state,
  created_at,
  updated_at
FROM caphub.review_requests
WHERE state = 'WAITING_FOR_REVIEW'
OFFSET 0;

CREATE VIEW caphub.registry_lineage_read
WITH (security_barrier = true)
AS
SELECT
  from_node_id,
  from_kind,
  from_version,
  from_digest,
  relationship,
  to_node_id,
  to_kind,
  to_version,
  to_digest,
  created_at
FROM caphub.registry_lineage
OFFSET 0;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'caphub_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA caphub TO caphub_app';
    EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA caphub TO caphub_app';
    EXECUTE 'GRANT INSERT ON caphub.registry_versions, caphub.registry_lineage,
      caphub.capture_idempotency, caphub.registry_imports, caphub.review_decisions,
      caphub.decision_consumers, caphub.audit_events TO caphub_app';
    EXECUTE 'GRANT INSERT ON caphub.registry_records, caphub.review_requests TO caphub_app';
    EXECUTE 'GRANT UPDATE (current_version, updated_at) ON caphub.registry_records TO caphub_app';
    EXECUTE 'GRANT UPDATE (lock_version, state, superseded_by_request_id, updated_at)
      ON caphub.review_requests TO caphub_app';
  END IF;
END
$$;
