-- CR1: operator revoke must survive a later grant webhook, and outbox
-- idempotency is per tenant. A global UNIQUE lets tenant B's event id
-- collide with tenant A and fail B's ingest forever.

ALTER TABLE maydo.grants
  ADD COLUMN IF NOT EXISTS operator_lock boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'maydo'
    AND rel.relname = 'outbox'
    AND con.contype = 'u'
    AND pg_get_constraintdef(con.oid) ILIKE '%idempotency_key%'
    AND pg_get_constraintdef(con.oid) NOT ILIKE '%tenant_id%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE maydo.outbox DROP CONSTRAINT %I', cname);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS outbox_tenant_idempotency_idx
  ON maydo.outbox (tenant_id, idempotency_key);
