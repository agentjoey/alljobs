-- P4 forward-only export evolution.
--
-- Extends Registry kinds with deployment_plan (dpl_), the deployment review
-- kind/subject pair, and the release:proposes:deployment_plan /
-- deployment_plan:realized_as:deployment lineage edges. Historical rows are
-- never rewritten; append-only triggers and least-privilege grants from
-- 001/002 remain untouched.

CREATE OR REPLACE FUNCTION caphub.registry_record_id_matches_kind(candidate text, record_kind text)
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
    WHEN 'deployment_plan' THEN candidate ~ '^dpl_[0-9a-f]{32}$'
    WHEN 'usage_observation' THEN candidate ~ '^obs_[0-9a-f]{32}$'
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION caphub.review_subject_id_matches_kind(candidate text, subject_kind text)
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
    WHEN 'deployment_plan' THEN candidate ~ '^dpl_[0-9a-f]{32}$'
    ELSE false
  END
$$;

ALTER TABLE caphub.registry_records
  DROP CONSTRAINT IF EXISTS registry_records_kind_check;
ALTER TABLE caphub.registry_records
  ADD CONSTRAINT registry_records_kind_check CHECK (kind IN (
    'capture', 'analysis_job', 'analysis_artifact', 'review_packet', 'entity', 'claim',
    'evidence', 'candidate', 'experience_card', 'build_proposal', 'release', 'deployment',
    'deployment_plan', 'usage_observation'
  ));

ALTER TABLE caphub.lineage_nodes
  DROP CONSTRAINT IF EXISTS lineage_nodes_node_kind_check;
ALTER TABLE caphub.lineage_nodes
  ADD CONSTRAINT lineage_nodes_node_kind_check CHECK (node_kind IN (
    'capture', 'analysis_job', 'analysis_artifact', 'review_packet', 'entity', 'claim',
    'evidence', 'candidate', 'experience_card', 'build_proposal', 'release', 'deployment',
    'deployment_plan', 'usage_observation', 'review_request', 'review_decision'
  ));

ALTER TABLE caphub.review_requests
  DROP CONSTRAINT IF EXISTS review_requests_review_kind_check;
ALTER TABLE caphub.review_requests
  ADD CONSTRAINT review_requests_review_kind_check CHECK (review_kind IN (
    'candidate', 'build', 'implementation', 'release', 'update', 'deployment'
  ));

ALTER TABLE caphub.review_requests
  DROP CONSTRAINT IF EXISTS review_requests_subject_kind_check;
ALTER TABLE caphub.review_requests
  ADD CONSTRAINT review_requests_subject_kind_check CHECK (subject_kind IN (
    'candidate', 'build_proposal', 'implementation_asset', 'release', 'update_proposal',
    'deployment_plan'
  ));

ALTER TABLE caphub.review_requests
  DROP CONSTRAINT IF EXISTS review_requests_kind_subject_check;
ALTER TABLE caphub.review_requests
  ADD CONSTRAINT review_requests_kind_subject_check CHECK (
    (review_kind = 'candidate' AND subject_kind = 'candidate')
    OR (review_kind = 'build' AND subject_kind = 'build_proposal')
    OR (review_kind = 'implementation' AND subject_kind = 'implementation_asset')
    OR (review_kind = 'release' AND subject_kind = 'release')
    OR (review_kind = 'update' AND subject_kind = 'update_proposal')
    OR (review_kind = 'deployment' AND subject_kind = 'deployment_plan')
  );

ALTER TABLE caphub.review_decisions
  DROP CONSTRAINT IF EXISTS review_decisions_review_kind_check;
ALTER TABLE caphub.review_decisions
  ADD CONSTRAINT review_decisions_review_kind_check CHECK (review_kind IN (
    'candidate', 'build', 'implementation', 'release', 'update', 'deployment'
  ));

ALTER TABLE caphub.registry_lineage
  DROP CONSTRAINT IF EXISTS registry_lineage_allowed_edge_check;
ALTER TABLE caphub.registry_lineage
  ADD CONSTRAINT registry_lineage_allowed_edge_check CHECK (
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
    OR (from_kind = 'release' AND relationship = 'proposes' AND to_kind = 'deployment_plan')
    OR (from_kind = 'deployment_plan' AND relationship = 'realized_as' AND to_kind = 'deployment')
    OR (from_kind = 'deployment' AND relationship = 'observed_as' AND to_kind = 'usage_observation')
    OR (from_kind = 'review_request' AND relationship = 'decided_by' AND to_kind = 'review_decision')
  );

CREATE INDEX IF NOT EXISTS review_requests_subject_version_idx
  ON caphub.review_requests (subject_id, subject_version);
