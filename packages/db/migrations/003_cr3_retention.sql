-- CR3: audit purge is cross-tenant by design (retention), but a caller must
-- not be able to pass a tiny day count and wipe recent evidence. Runtime
-- roles also lose table DELETE; only this function, as the table owner,
-- removes expired audit rows.

CREATE OR REPLACE FUNCTION maydo.purge_allow_audit(p_days int)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = maydo, pg_temp
AS $$
DECLARE
  n bigint;
BEGIN
  IF p_days IS NULL OR p_days < 30 THEN
    RAISE EXCEPTION 'retention days must be >= 30';
  END IF;
  DELETE FROM maydo.allow_audit WHERE ts < now() - make_interval(days => p_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM maydo.audit_queue
  WHERE state = 'done' AND created_at < now() - interval '1 day';
  RETURN n;
END $$;

REVOKE DELETE ON maydo.allow_audit FROM maydo_api, maydo_worker;
REVOKE DELETE ON maydo.audit_queue FROM maydo_api, maydo_worker;
