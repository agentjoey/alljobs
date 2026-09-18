CREATE TABLE caphub.capture_filename_heads (
  filename_key text PRIMARY KEY CHECK (length(filename_key) BETWEEN 1 AND 255),
  capture_id text NOT NULL REFERENCES caphub.registry_records(record_id) ON DELETE RESTRICT,
  digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  version integer NOT NULL CHECK (version > 0),
  updated_at timestamptz NOT NULL
);
CREATE TABLE caphub.capture_filename_versions (
  capture_id text PRIMARY KEY REFERENCES caphub.registry_records(record_id) ON DELETE RESTRICT,
  filename_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  canonical_capture_id text NOT NULL REFERENCES caphub.registry_records(record_id) ON DELETE RESTRICT,
  digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX capture_filename_canonical_version ON caphub.capture_filename_versions(filename_key, version)
  WHERE capture_id = canonical_capture_id;
CREATE INDEX capture_filename_history ON caphub.capture_filename_versions(filename_key, version DESC);
CREATE TABLE caphub.analysis_requests (
  capture_id text NOT NULL REFERENCES caphub.registry_records(record_id) ON DELETE RESTRICT,
  contract text NOT NULL CHECK (contract = 'caphub-analysis-v4'),
  state text NOT NULL CHECK (state IN ('queued','running','waiting_for_review','needs_attention','completed')),
  owner_token text,
  lease_until timestamptz,
  job_id text,
  review_request_id text REFERENCES caphub.review_requests(request_id) ON DELETE RESTRICT,
  error_code text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (capture_id, contract),
  CHECK ((state = 'running') = (owner_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX analysis_requests_claim ON caphub.analysis_requests(state, lease_until, created_at);
CREATE TABLE caphub.capture_object_retention (
  capture_id text PRIMARY KEY REFERENCES caphub.registry_records(record_id) ON DELETE RESTRICT,
  digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  imported_at timestamptz,
  eligible_at timestamptz,
  purged_at timestamptz,
  error_code text,
  CHECK ((imported_at IS NULL) = (eligible_at IS NULL)),
  CHECK (eligible_at IS NULL OR eligible_at >= imported_at + interval '30 days'),
  CHECK (purged_at IS NULL OR (eligible_at IS NOT NULL AND purged_at >= eligible_at))
);
CREATE INDEX capture_retention_digest ON caphub.capture_object_retention(digest);
CREATE INDEX capture_retention_due ON caphub.capture_object_retention(eligible_at) WHERE purged_at IS NULL;
ALTER TABLE caphub.audit_events DROP CONSTRAINT audit_events_event_type_check;
ALTER TABLE caphub.audit_events ADD CONSTRAINT audit_events_event_type_check CHECK (event_type IN (
  'capture.received','model.started','model.succeeded','model.failed',
  'registry.imported','review.requested','review.decided','review.revoked','review.consumed',
  'capture.object.retention_deleted'
));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='caphub_app') THEN
    GRANT SELECT, INSERT, UPDATE ON caphub.capture_filename_heads, caphub.capture_filename_versions,
      caphub.analysis_requests, caphub.capture_object_retention TO caphub_app;
  END IF;
END $$;
