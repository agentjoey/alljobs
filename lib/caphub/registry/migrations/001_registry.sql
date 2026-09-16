CREATE SCHEMA IF NOT EXISTS caphub;

CREATE TABLE IF NOT EXISTS caphub.schema_migrations (
  version text PRIMARY KEY,
  checksum character(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION caphub.registry_record_id_matches_kind(candidate text, record_kind text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE record_kind
    WHEN 'capture' THEN candidate ~ '^cap_[0-9a-f]{32}$'
    WHEN 'analysis_job' THEN candidate ~ '^job_[0-9a-f]{32}$'
    WHEN 'analysis_artifact' THEN candidate ~ '^art_[0-9a-f]{64}$'
    WHEN 'review_packet' THEN candidate ~ '^rvp_[0-9a-f]{32}$'
    WHEN 'entity' THEN candidate ~ '^ent_[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    WHEN 'claim' THEN candidate ~ '^clm_[0-9a-f]{32}$'
    WHEN 'evidence' THEN candidate ~ '^ev_[0-9a-f]{32}$'
    WHEN 'candidate' THEN candidate ~ '^cand_[0-9a-f]{32}$'
    WHEN 'experience_card' THEN candidate ~ '^exp_[0-9a-f]{32}$'
    WHEN 'build_proposal' THEN candidate ~ '^bld_[0-9a-f]{32}$'
    WHEN 'release' THEN candidate ~ '^rel_[0-9a-f]{32}$'
    WHEN 'deployment' THEN candidate ~ '^dep_[0-9a-f]{32}$'
    WHEN 'usage_observation' THEN candidate ~ '^obs_[0-9a-f]{32}$'
    ELSE false
  END
$$;

CREATE FUNCTION caphub.review_subject_id_matches_kind(candidate text, subject_kind text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE subject_kind
    WHEN 'candidate' THEN candidate ~ '^cand_[0-9a-f]{32}$'
    WHEN 'build_proposal' THEN candidate ~ '^bld_[0-9a-f]{32}$'
    WHEN 'implementation_asset' THEN candidate ~ '^impl_[0-9a-f]{32}$'
    WHEN 'release' THEN candidate ~ '^rel_[0-9a-f]{32}$'
    WHEN 'update_proposal' THEN candidate ~ '^upd_[0-9a-f]{32}$'
    ELSE false
  END
$$;

CREATE FUNCTION caphub.lineage_node_id_matches_kind(candidate text, node_kind text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE node_kind
    WHEN 'review_request' THEN candidate ~ '^rev_[0-9a-f]{32}$'
    WHEN 'review_decision' THEN candidate ~ '^dec_[0-9a-f]{32}$'
    ELSE caphub.registry_record_id_matches_kind(candidate, node_kind)
  END
$$;

CREATE FUNCTION caphub.prevent_immutable_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'caphub.% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END
$$;

CREATE TABLE caphub.registry_records (
  record_id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN (
    'capture', 'analysis_job', 'analysis_artifact', 'review_packet', 'entity', 'claim',
    'evidence', 'candidate', 'experience_card', 'build_proposal', 'release', 'deployment',
    'usage_observation'
  )),
  current_version integer NOT NULL CHECK (current_version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT registry_records_id_kind_check CHECK (caphub.registry_record_id_matches_kind(record_id, kind)),
  CONSTRAINT registry_records_id_kind_unique UNIQUE (record_id, kind)
);

CREATE TABLE caphub.registry_versions (
  record_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  kind text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version = 1),
  payload jsonb NOT NULL,
  payload_digest character(64) NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
  previous_version integer,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (record_id, version),
  CONSTRAINT registry_versions_record_kind_fk
    FOREIGN KEY (record_id, kind) REFERENCES caphub.registry_records (record_id, kind)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT registry_versions_previous_check CHECK (
    (version = 1 AND previous_version IS NULL)
    OR (version > 1 AND previous_version = version - 1)
  )
);

ALTER TABLE caphub.registry_records
  ADD CONSTRAINT registry_records_current_version_fk
  FOREIGN KEY (record_id, current_version)
  REFERENCES caphub.registry_versions (record_id, version)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE caphub.lineage_nodes (
  node_id text NOT NULL,
  node_kind text NOT NULL CHECK (node_kind IN (
    'capture', 'analysis_job', 'analysis_artifact', 'review_packet', 'entity', 'claim',
    'evidence', 'candidate', 'experience_card', 'build_proposal', 'release', 'deployment',
    'usage_observation', 'review_request', 'review_decision'
  )),
  node_version integer NOT NULL CHECK (node_version > 0),
  node_digest character(64) NOT NULL CHECK (node_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (node_id, node_version),
  CONSTRAINT lineage_nodes_identity_unique UNIQUE (node_id, node_version, node_kind, node_digest),
  CONSTRAINT lineage_nodes_id_kind_check CHECK (caphub.lineage_node_id_matches_kind(node_id, node_kind))
);

CREATE FUNCTION caphub.register_registry_lineage_node()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, caphub
AS $$
BEGIN
  INSERT INTO caphub.lineage_nodes (node_id, node_kind, node_version, node_digest, created_at)
  VALUES (NEW.record_id, NEW.kind, NEW.version, NEW.payload_digest, NEW.created_at);
  RETURN NEW;
END
$$;

CREATE TRIGGER registry_versions_register_lineage_node
AFTER INSERT ON caphub.registry_versions
FOR EACH ROW EXECUTE FUNCTION caphub.register_registry_lineage_node();

CREATE TABLE caphub.review_requests (
  request_id text PRIMARY KEY CHECK (request_id ~ '^rev_[0-9a-f]{32}$'),
  review_kind text NOT NULL CHECK (review_kind IN ('candidate', 'build', 'implementation', 'release', 'update')),
  subject_kind text NOT NULL CHECK (subject_kind IN (
    'candidate', 'build_proposal', 'implementation_asset', 'release', 'update_proposal'
  )),
  subject_id text NOT NULL,
  subject_version integer NOT NULL CHECK (subject_version > 0),
  subject_digest character(64) NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  lock_version integer NOT NULL CHECK (lock_version > 0),
  state text NOT NULL CHECK (state IN ('WAITING_FOR_REVIEW', 'APPROVED', 'REJECTED', 'REVOKED', 'SUPERSEDED')),
  approve_confirmation text NOT NULL CHECK (length(approve_confirmation) <= 96),
  reject_confirmation text NOT NULL CHECK (length(reject_confirmation) <= 96),
  superseded_by_request_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT review_requests_subject_check CHECK (
    caphub.review_subject_id_matches_kind(subject_id, subject_kind)
  ),
  CONSTRAINT review_requests_kind_subject_check CHECK (
    (review_kind = 'candidate' AND subject_kind = 'candidate')
    OR (review_kind = 'build' AND subject_kind = 'build_proposal')
    OR (review_kind = 'implementation' AND subject_kind = 'implementation_asset')
    OR (review_kind = 'release' AND subject_kind = 'release')
    OR (review_kind = 'update' AND subject_kind = 'update_proposal')
  ),
  CONSTRAINT review_requests_superseded_fk
    FOREIGN KEY (superseded_by_request_id) REFERENCES caphub.review_requests (request_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT review_requests_superseded_check CHECK (
    (state = 'SUPERSEDED' AND superseded_by_request_id IS NOT NULL AND superseded_by_request_id <> request_id)
    OR (state <> 'SUPERSEDED' AND superseded_by_request_id IS NULL)
  )
);

CREATE FUNCTION caphub.register_review_request_lineage_node()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, caphub
AS $$
BEGIN
  INSERT INTO caphub.lineage_nodes (node_id, node_kind, node_version, node_digest, created_at)
  VALUES (NEW.request_id, 'review_request', 1, NEW.subject_digest, NEW.created_at);
  RETURN NEW;
END
$$;

CREATE TRIGGER review_requests_register_lineage_node
AFTER INSERT ON caphub.review_requests
FOR EACH ROW EXECUTE FUNCTION caphub.register_review_request_lineage_node();

CREATE TABLE caphub.review_decisions (
  decision_id text PRIMARY KEY CHECK (decision_id ~ '^dec_[0-9a-f]{32}$'),
  request_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 12 AND 128),
  expected_lock_version integer NOT NULL CHECK (expected_lock_version > 0),
  expected_subject_digest character(64) NOT NULL CHECK (expected_subject_digest ~ '^[0-9a-f]{64}$'),
  action text NOT NULL CHECK (action IN ('approve', 'reject', 'revoke')),
  confirmation text NOT NULL CHECK (length(confirmation) <= 96),
  rationale text NOT NULL CHECK (length(rationale) <= 2000),
  disposition text CHECK (disposition IN ('adopt', 'adapt', 'build', 'learn', 'watch')),
  review_kind text NOT NULL CHECK (review_kind IN ('candidate', 'build', 'implementation', 'release', 'update')),
  subject_id text NOT NULL,
  subject_version integer NOT NULL CHECK (subject_version > 0),
  subject_digest character(64) NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  actor text NOT NULL CHECK (actor = 'human:owner'),
  confirmation_digest character(64) NOT NULL CHECK (confirmation_digest ~ '^[0-9a-f]{64}$'),
  original_approval_decision_id text,
  revokes_decision_id text,
  recorded_at timestamptz NOT NULL,
  CONSTRAINT review_decisions_request_fk
    FOREIGN KEY (request_id) REFERENCES caphub.review_requests (request_id) ON DELETE RESTRICT,
  CONSTRAINT review_decisions_original_fk
    FOREIGN KEY (original_approval_decision_id) REFERENCES caphub.review_decisions (decision_id) ON DELETE RESTRICT,
  CONSTRAINT review_decisions_revokes_fk
    FOREIGN KEY (revokes_decision_id) REFERENCES caphub.review_decisions (decision_id) ON DELETE RESTRICT,
  CONSTRAINT review_decisions_expected_subject_match_check CHECK (subject_digest = expected_subject_digest),
  CONSTRAINT review_decisions_action_rationale_check CHECK (
    action = 'approve' OR length(btrim(rationale)) > 0
  ),
  CONSTRAINT review_decisions_candidate_disposition_check CHECK (
    (action = 'approve' AND review_kind = 'candidate' AND disposition IS NOT NULL)
    OR ((action <> 'approve' OR review_kind <> 'candidate') AND disposition IS NULL)
  ),
  CONSTRAINT review_decisions_revoke_link_check CHECK (
    (action = 'revoke' AND original_approval_decision_id IS NOT NULL
      AND revokes_decision_id = original_approval_decision_id)
    OR (action <> 'revoke' AND original_approval_decision_id IS NULL AND revokes_decision_id IS NULL)
  )
);

CREATE FUNCTION caphub.register_review_decision_lineage_node()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, caphub
AS $$
BEGIN
  INSERT INTO caphub.lineage_nodes (node_id, node_kind, node_version, node_digest, created_at)
  VALUES (NEW.decision_id, 'review_decision', 1, NEW.confirmation_digest, NEW.recorded_at);
  RETURN NEW;
END
$$;

CREATE TRIGGER review_decisions_register_lineage_node
AFTER INSERT ON caphub.review_decisions
FOR EACH ROW EXECUTE FUNCTION caphub.register_review_decision_lineage_node();

CREATE TABLE caphub.registry_lineage (
  from_node_id text NOT NULL,
  from_kind text NOT NULL,
  from_version integer NOT NULL CHECK (from_version > 0),
  from_digest character(64) NOT NULL CHECK (from_digest ~ '^[0-9a-f]{64}$'),
  relationship text NOT NULL CHECK (relationship IN (
    'analyzed_by', 'produced', 'contributes_to', 'derived_as', 'contains', 'identifies',
    'proposes', 'approved_as', 'realized_as', 'deployed_as', 'observed_as', 'decided_by'
  )),
  to_node_id text NOT NULL,
  to_kind text NOT NULL,
  to_version integer NOT NULL CHECK (to_version > 0),
  to_digest character(64) NOT NULL CHECK (to_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (from_node_id, from_version, relationship, to_node_id, to_version),
  CONSTRAINT registry_lineage_from_fk
    FOREIGN KEY (from_node_id, from_version, from_kind, from_digest)
    REFERENCES caphub.lineage_nodes (node_id, node_version, node_kind, node_digest)
    ON DELETE RESTRICT,
  CONSTRAINT registry_lineage_to_fk
    FOREIGN KEY (to_node_id, to_version, to_kind, to_digest)
    REFERENCES caphub.lineage_nodes (node_id, node_version, node_kind, node_digest)
    ON DELETE RESTRICT,
  CONSTRAINT registry_lineage_allowed_edge_check CHECK (
    (from_kind = 'capture' AND relationship = 'analyzed_by' AND to_kind = 'analysis_job')
    OR (from_kind = 'analysis_job' AND relationship = 'produced' AND to_kind = 'analysis_artifact')
    OR (from_kind = 'analysis_artifact' AND relationship = 'contributes_to' AND to_kind = 'review_packet')
    OR (from_kind = 'capture' AND relationship = 'derived_as' AND to_kind = 'review_packet')
    OR (from_kind = 'review_packet' AND relationship = 'contains' AND to_kind = 'evidence')
    OR (from_kind = 'review_packet' AND relationship = 'identifies' AND to_kind = 'entity')
    OR (from_kind = 'review_packet' AND relationship = 'contains' AND to_kind = 'claim')
    OR (from_kind = 'review_packet' AND relationship = 'proposes' AND to_kind = 'candidate')
    OR (from_kind = 'candidate' AND relationship = 'approved_as' AND to_kind = 'experience_card')
    OR (from_kind = 'candidate' AND relationship = 'approved_as' AND to_kind = 'build_proposal')
    OR (from_kind = 'candidate' AND relationship = 'realized_as' AND to_kind = 'release')
    OR (from_kind = 'build_proposal' AND relationship = 'realized_as' AND to_kind = 'release')
    OR (from_kind = 'release' AND relationship = 'deployed_as' AND to_kind = 'deployment')
    OR (from_kind = 'deployment' AND relationship = 'observed_as' AND to_kind = 'usage_observation')
    OR (from_kind = 'review_request' AND relationship = 'decided_by' AND to_kind = 'review_decision')
  ),
  CONSTRAINT registry_lineage_distinct_check CHECK (
    from_node_id <> to_node_id OR from_version <> to_version
  )
);

CREATE TABLE caphub.capture_idempotency (
  idempotency_key text PRIMARY KEY CHECK (length(idempotency_key) BETWEEN 12 AND 128),
  request_digest character(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  capture_id text NOT NULL CHECK (capture_id ~ '^cap_[0-9a-f]{32}$'),
  created_at timestamptz NOT NULL,
  CONSTRAINT capture_idempotency_capture_fk
    FOREIGN KEY (capture_id) REFERENCES caphub.registry_records (record_id) ON DELETE RESTRICT
);

CREATE TABLE caphub.registry_imports (
  import_id text PRIMARY KEY CHECK (import_id ~ '^imp_[0-9a-f]{32}$'),
  source_review_packet_id text NOT NULL CHECK (source_review_packet_id ~ '^rvp_[0-9a-f]{32}$'),
  source_review_packet_digest character(64) NOT NULL CHECK (source_review_packet_digest ~ '^[0-9a-f]{64}$'),
  manifest jsonb NOT NULL,
  review_request_id text NOT NULL,
  imported_at timestamptz NOT NULL,
  CONSTRAINT registry_imports_source_unique UNIQUE (source_review_packet_id),
  CONSTRAINT registry_imports_request_fk
    FOREIGN KEY (review_request_id) REFERENCES caphub.review_requests (request_id) ON DELETE RESTRICT
);

CREATE TABLE caphub.decision_consumers (
  decision_id text PRIMARY KEY,
  consumer_id text NOT NULL,
  consumed_at timestamptz NOT NULL,
  CONSTRAINT decision_consumers_decision_fk
    FOREIGN KEY (decision_id) REFERENCES caphub.review_decisions (decision_id) ON DELETE RESTRICT
);

CREATE TABLE caphub.audit_events (
  event_id text PRIMARY KEY CHECK (event_id ~ '^rae_[0-9a-f]{32}$'),
  event_type text NOT NULL CHECK (event_type IN (
    'registry.imported', 'review.requested', 'review.decided', 'review.revoked', 'review.consumed'
  )),
  actor text NOT NULL CHECK (actor IN ('system:caphub', 'human:owner')),
  subject_id text NOT NULL,
  subject_version integer NOT NULL CHECK (subject_version > 0),
  decision_id text,
  metadata jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  CONSTRAINT audit_events_decision_fk
    FOREIGN KEY (decision_id) REFERENCES caphub.review_decisions (decision_id) ON DELETE RESTRICT
);

CREATE TRIGGER schema_migrations_append_only
BEFORE UPDATE OR DELETE ON caphub.schema_migrations
FOR EACH ROW EXECUTE FUNCTION caphub.prevent_immutable_change();
CREATE TRIGGER registry_versions_append_only
BEFORE UPDATE OR DELETE ON caphub.registry_versions
FOR EACH ROW EXECUTE FUNCTION caphub.prevent_immutable_change();
CREATE TRIGGER lineage_nodes_append_only
BEFORE UPDATE OR DELETE ON caphub.lineage_nodes
FOR EACH ROW EXECUTE FUNCTION caphub.prevent_immutable_change();
CREATE TRIGGER registry_lineage_append_only
BEFORE UPDATE OR DELETE ON caphub.registry_lineage
FOR EACH ROW EXECUTE FUNCTION caphub.prevent_immutable_change();
CREATE TRIGGER capture_idempotency_append_only
BEFORE UPDATE OR DELETE ON caphub.capture_idempotency
FOR EACH ROW EXECUTE FUNCTION caphub.prevent_immutable_change();
CREATE TRIGGER registry_imports_append_only
BEFORE UPDATE OR DELETE ON caphub.registry_imports
FOR EACH ROW EXECUTE FUNCTION caphub.prevent_immutable_change();
CREATE TRIGGER review_decisions_append_only
BEFORE UPDATE OR DELETE ON caphub.review_decisions
FOR EACH ROW EXECUTE FUNCTION caphub.prevent_immutable_change();
CREATE TRIGGER decision_consumers_append_only
BEFORE UPDATE OR DELETE ON caphub.decision_consumers
FOR EACH ROW EXECUTE FUNCTION caphub.prevent_immutable_change();
CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON caphub.audit_events
FOR EACH ROW EXECUTE FUNCTION caphub.prevent_immutable_change();

REVOKE ALL ON FUNCTION caphub.register_registry_lineage_node() FROM PUBLIC;
REVOKE ALL ON FUNCTION caphub.register_review_request_lineage_node() FROM PUBLIC;
REVOKE ALL ON FUNCTION caphub.register_review_decision_lineage_node() FROM PUBLIC;
