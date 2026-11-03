BEGIN;

DO $$
BEGIN
  CREATE TYPE bin_status AS ENUM (
    'EMPTY',
    'LOW',
    'MEDIUM',
    'HIGH',
    'FULL',
    'MAINTENANCE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE SEQUENCE IF NOT EXISTS waste_bin_code_seq;

CREATE TABLE IF NOT EXISTS waste_bins (
  id SERIAL PRIMARY KEY,
  household_id INTEGER NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  bin_code VARCHAR(64) NOT NULL UNIQUE DEFAULT ('BIN-' || nextval('waste_bin_code_seq')::text),
  capacity INTEGER NOT NULL DEFAULT 120 CHECK (capacity > 0),
  fill_level INTEGER NOT NULL DEFAULT 0 CHECK (fill_level BETWEEN 0 AND 100),
  status bin_status NOT NULL DEFAULT 'EMPTY',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE waste_bins
  ALTER COLUMN bin_code SET DEFAULT ('BIN-' || nextval('waste_bin_code_seq')::text),
  ALTER COLUMN capacity SET DEFAULT 120;

CREATE INDEX IF NOT EXISTS idx_waste_bins_status ON waste_bins (status);

SELECT setval(
  'waste_bin_code_seq',
  GREATEST(
    COALESCE(
      (SELECT MAX(substring(bin_code FROM 5)::bigint)
       FROM waste_bins
       WHERE bin_code ~ '^BIN-[0-9]+$'),
      0
    ) + 1,
    1
  ),
  false
);

INSERT INTO waste_bins (household_id)
SELECT h.id
FROM households h
WHERE NOT EXISTS (
  SELECT 1 FROM waste_bins b WHERE b.household_id = h.id
);

DROP TRIGGER IF EXISTS waste_bins_set_updated_at ON waste_bins;
CREATE TRIGGER waste_bins_set_updated_at BEFORE UPDATE ON waste_bins
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION enforce_household_has_waste_bin()
RETURNS TRIGGER AS $$
DECLARE
  affected_household_id INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'households' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    affected_household_id := NEW.id;
    IF EXISTS (SELECT 1 FROM households WHERE id = affected_household_id)
      AND NOT EXISTS (SELECT 1 FROM waste_bins WHERE household_id = affected_household_id) THEN
      RAISE EXCEPTION 'Household % must have exactly one waste bin', affected_household_id
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    affected_household_id := OLD.household_id;
    IF EXISTS (SELECT 1 FROM households WHERE id = affected_household_id)
      AND NOT EXISTS (SELECT 1 FROM waste_bins WHERE household_id = affected_household_id) THEN
      RAISE EXCEPTION 'Household % must have exactly one waste bin', affected_household_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    affected_household_id := NEW.household_id;
    IF EXISTS (SELECT 1 FROM households WHERE id = affected_household_id)
      AND NOT EXISTS (SELECT 1 FROM waste_bins WHERE household_id = affected_household_id) THEN
      RAISE EXCEPTION 'Household % must have exactly one waste bin', affected_household_id
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS households_require_waste_bin ON households;
CREATE CONSTRAINT TRIGGER households_require_waste_bin
AFTER INSERT OR UPDATE ON households
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_household_has_waste_bin();

DROP TRIGGER IF EXISTS waste_bins_require_household ON waste_bins;
CREATE CONSTRAINT TRIGGER waste_bins_require_household
AFTER INSERT OR UPDATE OR DELETE ON waste_bins
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_household_has_waste_bin();

COMMIT;
