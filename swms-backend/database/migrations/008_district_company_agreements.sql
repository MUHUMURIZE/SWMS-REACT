BEGIN;

CREATE TABLE districts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  assignment_status VARCHAR(12) NOT NULL DEFAULT 'UNASSIGNED'
    CHECK (assignment_status IN ('UNASSIGNED', 'ASSIGNED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX districts_name_normalized_unique
  ON districts (LOWER(BTRIM(name)));

CREATE TRIGGER districts_set_updated_at
BEFORE UPDATE ON districts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE company_district_agreements (
  id SERIAL PRIMARY KEY,
  district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  status VARCHAR(12) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'TERMINATED')),
  starts_on DATE NOT NULL,
  ends_on DATE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ended_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE UNIQUE INDEX company_district_one_active_agreement
  ON company_district_agreements (district_id)
  WHERE status = 'ACTIVE';

CREATE INDEX company_district_agreements_history
  ON company_district_agreements (district_id, created_at DESC, id DESC);

CREATE INDEX company_district_agreements_company
  ON company_district_agreements (company_id, status);

CREATE OR REPLACE FUNCTION guard_company_district_agreement()
RETURNS TRIGGER AS $$
DECLARE
  overlapping_id INTEGER;
BEGIN
  PERFORM 1 FROM districts WHERE id = NEW.district_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'District does not exist' USING ERRCODE = '23503';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'PENDING' THEN
      RAISE EXCEPTION 'New district agreements must be pending' USING ERRCODE = '23514';
    END IF;
    IF NEW.starts_on < CURRENT_DATE THEN
      RAISE EXCEPTION 'Agreement start date cannot be in the past' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.district_id IS DISTINCT FROM OLD.district_id
      OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.starts_on IS DISTINCT FROM OLD.starts_on
      OR NEW.ends_on IS DISTINCT FROM OLD.ends_on THEN
      RAISE EXCEPTION 'Agreement terms are immutable; create a new agreement' USING ERRCODE = '23514';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
      AND NOT (
        (OLD.status = 'PENDING' AND NEW.status = 'ACTIVE')
        OR (OLD.status = 'ACTIVE' AND NEW.status IN ('EXPIRED', 'SUSPENDED', 'TERMINATED'))
      ) THEN
      RAISE EXCEPTION 'Invalid district agreement status transition' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'ACTIVE' THEN
    IF NEW.starts_on > CURRENT_DATE OR (NEW.ends_on IS NOT NULL AND NEW.ends_on < CURRENT_DATE) THEN
      RAISE EXCEPTION 'Agreement is not valid for activation on the current date' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'PENDING' THEN
      NEW.activated_at = CURRENT_TIMESTAMP;
    END IF;
  END IF;

  IF NEW.status IN ('EXPIRED', 'SUSPENDED', 'TERMINATED')
    AND TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE' THEN
    NEW.ended_at = CURRENT_TIMESTAMP;
    IF NEW.status IN ('SUSPENDED', 'TERMINATED') AND NEW.ended_by IS NULL THEN
      RAISE EXCEPTION 'An administrator is required to end an agreement' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status IN ('PENDING', 'ACTIVE') THEN
    SELECT id INTO overlapping_id
    FROM company_district_agreements
    WHERE district_id = NEW.district_id
      AND status IN ('PENDING', 'ACTIVE')
      AND id IS DISTINCT FROM NEW.id
      AND daterange(starts_on, COALESCE(ends_on, 'infinity'::date), '[]')
        && daterange(NEW.starts_on, COALESCE(NEW.ends_on, 'infinity'::date), '[]')
    LIMIT 1;
    IF overlapping_id IS NOT NULL THEN
      RAISE EXCEPTION 'Agreement dates overlap another pending or active district agreement'
        USING ERRCODE = '23P01';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER company_district_agreements_guard
BEFORE INSERT OR UPDATE ON company_district_agreements
FOR EACH ROW EXECUTE FUNCTION guard_company_district_agreement();

CREATE OR REPLACE FUNCTION prevent_company_district_agreement_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'District agreement history cannot be deleted' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER company_district_agreements_preserve_history
BEFORE DELETE ON company_district_agreements
FOR EACH ROW EXECUTE FUNCTION prevent_company_district_agreement_delete();

CREATE OR REPLACE FUNCTION sync_district_assignment_status()
RETURNS TRIGGER AS $$
DECLARE
  affected_district_id INTEGER;
BEGIN
  affected_district_id := NEW.district_id;
  UPDATE districts
  SET assignment_status = CASE
    WHEN EXISTS (
      SELECT 1 FROM company_district_agreements
      WHERE district_id = affected_district_id AND status = 'ACTIVE'
    ) THEN 'ASSIGNED'
    ELSE 'UNASSIGNED'
  END
  WHERE id = affected_district_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER company_district_agreements_sync_assignment
AFTER INSERT OR UPDATE ON company_district_agreements
FOR EACH ROW EXECUTE FUNCTION sync_district_assignment_status();

COMMIT;
