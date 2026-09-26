-- MayDo entitlement kernel schema.
-- Runtime roles maydo_api and maydo_worker are NOSUPERUSER and NOBYPASSRLS.
-- Migrations run as the migrator (database owner), not as the worker.
-- Drain may claim the global outbox queue, then must set maydo.tenant_id
-- from the claimed row before any grant write. Grant policies do not
-- have a cross-tenant exception.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maydo_api') THEN
    CREATE ROLE maydo_api LOGIN PASSWORD 'maydo_api_dev' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  ELSE
    ALTER ROLE maydo_api NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'maydo_worker') THEN
    CREATE ROLE maydo_worker LOGIN PASSWORD 'maydo_worker_dev' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  ELSE
    ALTER ROLE maydo_worker NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS maydo;

CREATE TABLE IF NOT EXISTS maydo.schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maydo.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('active', 'disabled')),
  name text NOT NULL,
  ops_contact text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maydo.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES maydo.tenants (id),
  prefix text NOT NULL CHECK (prefix IN ('md_live_', 'md_test_', 'md_op_')),
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}',
  ip_allowlist cidr[] NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  revoked_at timestamptz,
  last_four text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maydo.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES maydo.tenants (id),
  provider text NOT NULL CHECK (provider IN ('stripe', 'polar')),
  ingest_token text NOT NULL UNIQUE,
  secret text NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maydo.provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES maydo.tenants (id),
  provider text NOT NULL CHECK (provider IN ('stripe', 'polar')),
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  livemode boolean,
  binding_id text,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('received', 'outboxed', 'processed', 'ignored', 'dead')),
  note text,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS maydo.outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES maydo.tenants (id),
  expansion_set_id uuid NOT NULL,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  adapter text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  state text NOT NULL CHECK (state IN ('pending', 'leased', 'done', 'dead')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  payload jsonb NOT NULL,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbox_claim_idx ON maydo.outbox (state, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS maydo.dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES maydo.tenants (id),
  outbox_id uuid,
  expansion_set_id uuid,
  provider text,
  provider_event_id text,
  adapter text,
  reason text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  replayed_at timestamptz
);

CREATE INDEX IF NOT EXISTS dead_letters_tenant_idx ON maydo.dead_letters (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS maydo.grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES maydo.tenants (id),
  actor text NOT NULL,
  action text NOT NULL,
  source text NOT NULL CHECK (source IN ('stripe', 'polar', 'local')),
  binding_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('active', 'revoked', 'expired')),
  precedence_class text NOT NULL CHECK (precedence_class IN ('allow', 'deny')),
  sticky boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  revoked_at timestamptz,
  source_event_id text,
  source_event_ts timestamptz,
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, actor, action, source, binding_id),
  CHECK (sticky = false OR source = 'local'),
  CHECK (sticky = false OR expires_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS grants_eval_idx ON maydo.grants (tenant_id, actor, action);

CREATE TABLE IF NOT EXISTS maydo.allow_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL REFERENCES maydo.tenants (id),
  actor text NOT NULL,
  action text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('allow', 'deny')),
  reason text NOT NULL,
  grant_ids uuid[] NOT NULL DEFAULT '{}',
  latency_bucket text NOT NULL
);

CREATE INDEX IF NOT EXISTS allow_audit_actor_idx ON maydo.allow_audit (tenant_id, actor, ts DESC);

CREATE TABLE IF NOT EXISTS maydo.audit_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES maydo.tenants (id),
  actor text NOT NULL,
  action text NOT NULL,
  decision text NOT NULL,
  reason text NOT NULL,
  grant_ids uuid[] NOT NULL DEFAULT '{}',
  latency_bucket text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'done')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_queue_pending_idx ON maydo.audit_queue (state, created_at);

CREATE TABLE IF NOT EXISTS maydo.mapping_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES maydo.tenants (id),
  provider text NOT NULL CHECK (provider IN ('stripe', 'polar')),
  event_type text NOT NULL,
  actions text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  product_or_price_id text,
  revoke_on_past_due boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(actions) <= 20)
);

CREATE UNIQUE INDEX IF NOT EXISTS mapping_config_uniq
  ON maydo.mapping_config (tenant_id, provider, event_type, COALESCE(product_or_price_id, ''));

CREATE TABLE IF NOT EXISTS maydo.actor_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES maydo.tenants (id),
  provider text NOT NULL CHECK (provider IN ('stripe', 'polar')),
  provider_customer_id text NOT NULL,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, provider_customer_id)
);

CREATE TABLE IF NOT EXISTS maydo.product_action_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES maydo.tenants (id),
  provider text NOT NULL CHECK (provider IN ('stripe', 'polar')),
  provider_price_or_product_id text NOT NULL,
  actions text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, provider_price_or_product_id),
  CHECK (cardinality(actions) BETWEEN 1 AND 20)
);

CREATE TABLE IF NOT EXISTS maydo.webhook_http_log (
  id bigserial PRIMARY KEY,
  tenant_id uuid,
  provider text NOT NULL,
  http_status int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_http_log_tenant_idx ON maydo.webhook_http_log (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS maydo.worker_heartbeat (
  id text PRIMARY KEY,
  beat_at timestamptz NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS maydo.operator_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES maydo.tenants (id),
  action text NOT NULL,
  grant_id uuid,
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Key lookup and webhook secret lookup run as the function owner (migrator)
-- so the API can resolve a bearer token before the tenant GUC is known.
CREATE OR REPLACE FUNCTION maydo.authenticate_key(p_hash text)
RETURNS TABLE (
  key_id uuid,
  tenant_id uuid,
  prefix text,
  scopes text[],
  ip_allowlist cidr[],
  expires_at timestamptz,
  revoked_at timestamptz,
  tenant_status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = maydo, pg_temp
AS $$
  SELECT k.id, k.tenant_id, k.prefix, k.scopes, k.ip_allowlist, k.expires_at, k.revoked_at, t.status
  FROM maydo.api_keys k
  JOIN maydo.tenants t ON t.id = k.tenant_id
  WHERE k.key_hash = p_hash
$$;

CREATE OR REPLACE FUNCTION maydo.resolve_webhook(p_token text)
RETURNS TABLE (
  tenant_id uuid,
  provider text,
  secret text,
  livemode boolean,
  tenant_status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = maydo, pg_temp
AS $$
  SELECT e.tenant_id, e.provider, e.secret, e.livemode, t.status
  FROM maydo.webhook_endpoints e
  JOIN maydo.tenants t ON t.id = e.tenant_id
  WHERE e.ingest_token = p_token
$$;

CREATE OR REPLACE FUNCTION maydo.log_webhook_http(p_tenant uuid, p_provider text, p_status int)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = maydo, pg_temp
AS $$
  INSERT INTO maydo.webhook_http_log (tenant_id, provider, http_status)
  VALUES (p_tenant, p_provider, p_status);
$$;

CREATE OR REPLACE FUNCTION maydo.purge_allow_audit(p_days int)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = maydo, pg_temp
AS $$
DECLARE
  n bigint;
BEGIN
  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'retention days must be >= 1';
  END IF;
  DELETE FROM maydo.allow_audit WHERE ts < now() - make_interval(days => p_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM maydo.audit_queue
  WHERE state = 'done' AND created_at < now() - interval '1 day';
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION maydo.touch_heartbeat(p_id text, p_details jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = maydo, pg_temp
AS $$
  INSERT INTO maydo.worker_heartbeat (id, beat_at, details)
  VALUES (p_id, now(), COALESCE(p_details, '{}'::jsonb))
  ON CONFLICT (id) DO UPDATE SET beat_at = now(), details = EXCLUDED.details;
$$;

REVOKE ALL ON FUNCTION maydo.authenticate_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION maydo.resolve_webhook(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION maydo.log_webhook_http(uuid, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION maydo.purge_allow_audit(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION maydo.touch_heartbeat(text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION maydo.authenticate_key(text) TO maydo_api, maydo_worker;
GRANT EXECUTE ON FUNCTION maydo.resolve_webhook(text) TO maydo_api;
GRANT EXECUTE ON FUNCTION maydo.log_webhook_http(uuid, text, int) TO maydo_api;
GRANT EXECUTE ON FUNCTION maydo.purge_allow_audit(int) TO maydo_worker;
GRANT EXECUTE ON FUNCTION maydo.touch_heartbeat(text, jsonb) TO maydo_worker;

GRANT USAGE ON SCHEMA maydo TO maydo_api, maydo_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA maydo TO maydo_api, maydo_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA maydo TO maydo_api, maydo_worker;
REVOKE DELETE ON maydo.grants FROM maydo_api, maydo_worker;
REVOKE INSERT, UPDATE, DELETE ON maydo.worker_heartbeat FROM maydo_api, maydo_worker;
REVOKE INSERT, UPDATE, DELETE ON maydo.webhook_http_log FROM maydo_api, maydo_worker;

ALTER TABLE maydo.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE maydo.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE maydo.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE maydo.api_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE maydo.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE maydo.webhook_endpoints FORCE ROW LEVEL SECURITY;
ALTER TABLE maydo.provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE maydo.provider_events FORCE ROW LEVEL SECURITY;
ALTER TABLE maydo.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE maydo.outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE maydo.dead_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE maydo.dead_letters FORCE ROW LEVEL SECURITY;
ALTER TABLE maydo.grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE maydo.grants FORCE ROW LEVEL SECURITY;
ALTER TABLE maydo.allow_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE maydo.allow_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE maydo.audit_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE maydo.audit_queue FORCE ROW LEVEL SECURITY;
ALTER TABLE maydo.mapping_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE maydo.mapping_config FORCE ROW LEVEL SECURITY;
ALTER TABLE maydo.actor_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE maydo.actor_maps FORCE ROW LEVEL SECURITY;
ALTER TABLE maydo.product_action_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE maydo.product_action_maps FORCE ROW LEVEL SECURITY;
ALTER TABLE maydo.operator_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE maydo.operator_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE maydo.webhook_http_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE maydo.webhook_http_log FORCE ROW LEVEL SECURITY;

-- Drop policies so the migration can be reasoned about if re-applied by hand.
DROP POLICY IF EXISTS tenant_select ON maydo.tenants;
DROP POLICY IF EXISTS tenant_all ON maydo.api_keys;
DROP POLICY IF EXISTS tenant_all ON maydo.webhook_endpoints;
DROP POLICY IF EXISTS tenant_all ON maydo.provider_events;
DROP POLICY IF EXISTS tenant_all ON maydo.dead_letters;
DROP POLICY IF EXISTS tenant_all ON maydo.grants;
DROP POLICY IF EXISTS tenant_all ON maydo.allow_audit;
DROP POLICY IF EXISTS tenant_all ON maydo.mapping_config;
DROP POLICY IF EXISTS tenant_all ON maydo.actor_maps;
DROP POLICY IF EXISTS tenant_all ON maydo.product_action_maps;
DROP POLICY IF EXISTS tenant_all ON maydo.operator_audit;
DROP POLICY IF EXISTS http_log_select ON maydo.webhook_http_log;
DROP POLICY IF EXISTS outbox_api ON maydo.outbox;
DROP POLICY IF EXISTS outbox_worker_select ON maydo.outbox;
DROP POLICY IF EXISTS outbox_worker_insert ON maydo.outbox;
DROP POLICY IF EXISTS outbox_worker_update ON maydo.outbox;
DROP POLICY IF EXISTS audit_queue_api ON maydo.audit_queue;
DROP POLICY IF EXISTS audit_queue_worker_select ON maydo.audit_queue;
DROP POLICY IF EXISTS audit_queue_worker_insert ON maydo.audit_queue;
DROP POLICY IF EXISTS audit_queue_worker_update ON maydo.audit_queue;

CREATE POLICY tenant_select ON maydo.tenants
  FOR SELECT TO maydo_api, maydo_worker
  USING (id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);

CREATE POLICY tenant_all ON maydo.api_keys
  FOR ALL TO maydo_api, maydo_worker
  USING (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);

CREATE POLICY tenant_all ON maydo.webhook_endpoints
  FOR ALL TO maydo_api, maydo_worker
  USING (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);

CREATE POLICY tenant_all ON maydo.provider_events
  FOR ALL TO maydo_api, maydo_worker
  USING (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);

CREATE POLICY tenant_all ON maydo.dead_letters
  FOR ALL TO maydo_api, maydo_worker
  USING (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);

CREATE POLICY tenant_all ON maydo.grants
  FOR ALL TO maydo_api, maydo_worker
  USING (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);

CREATE POLICY tenant_all ON maydo.allow_audit
  FOR ALL TO maydo_api, maydo_worker
  USING (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);

CREATE POLICY tenant_all ON maydo.mapping_config
  FOR ALL TO maydo_api, maydo_worker
  USING (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);

CREATE POLICY tenant_all ON maydo.actor_maps
  FOR ALL TO maydo_api, maydo_worker
  USING (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);

CREATE POLICY tenant_all ON maydo.product_action_maps
  FOR ALL TO maydo_api, maydo_worker
  USING (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);

CREATE POLICY tenant_all ON maydo.operator_audit
  FOR ALL TO maydo_api, maydo_worker
  USING (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);

CREATE POLICY http_log_select ON maydo.webhook_http_log
  FOR SELECT TO maydo_api, maydo_worker
  USING (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);

-- API outbox access is tenant-scoped. The worker may SEE pending/leased rows
-- when the GUC is unset (global claim). Writes still require the row tenant.
CREATE POLICY outbox_api ON maydo.outbox
  FOR ALL TO maydo_api
  USING (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);

CREATE POLICY outbox_worker_select ON maydo.outbox
  FOR SELECT TO maydo_worker
  USING (
    tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid
    OR (
      NULLIF(current_setting('maydo.tenant_id', true), '') IS NULL
      AND state IN ('pending', 'leased')
    )
  );

CREATE POLICY outbox_worker_insert ON maydo.outbox
  FOR INSERT TO maydo_worker
  WITH CHECK (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);

CREATE POLICY outbox_worker_update ON maydo.outbox
  FOR UPDATE TO maydo_worker
  USING (
    tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid
    OR (
      NULLIF(current_setting('maydo.tenant_id', true), '') IS NULL
      AND state IN ('pending', 'leased')
    )
  )
  WITH CHECK (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);

CREATE POLICY audit_queue_api ON maydo.audit_queue
  FOR ALL TO maydo_api
  USING (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);

CREATE POLICY audit_queue_worker_select ON maydo.audit_queue
  FOR SELECT TO maydo_worker
  USING (
    tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid
    OR (
      NULLIF(current_setting('maydo.tenant_id', true), '') IS NULL
      AND state = 'pending'
    )
  );

CREATE POLICY audit_queue_worker_insert ON maydo.audit_queue
  FOR INSERT TO maydo_worker
  WITH CHECK (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);

CREATE POLICY audit_queue_worker_update ON maydo.audit_queue
  FOR UPDATE TO maydo_worker
  USING (
    tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid
    OR (
      NULLIF(current_setting('maydo.tenant_id', true), '') IS NULL
      AND state = 'pending'
    )
  )
  WITH CHECK (tenant_id = NULLIF(current_setting('maydo.tenant_id', true), '')::uuid);
