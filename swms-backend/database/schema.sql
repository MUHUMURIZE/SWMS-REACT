DO $$
BEGIN
  CREATE TYPE user_role AS ENUM (
    'ADMIN',
    'COMPANY_REPRESENTATIVE',
    'COLLECTOR',
    'HOUSEHOLD'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE collection_status AS ENUM (
    'pending',
    'scheduled',
    'in_progress',
    'collected',
    'completed',
    'missed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

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

CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL,
  phone VARCHAR(32),
  token_version INTEGER NOT NULL DEFAULT 0 CHECK (token_version >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

CREATE TABLE IF NOT EXISTS representatives (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT
);

DROP INDEX IF EXISTS idx_representatives_company;
CREATE UNIQUE INDEX IF NOT EXISTS idx_representatives_company_unique ON representatives (company_id);

CREATE TABLE IF NOT EXISTS collectors (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  representative_id INTEGER NOT NULL REFERENCES representatives(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_collectors_representative ON collectors (representative_id);

CREATE TABLE IF NOT EXISTS households (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  collector_id INTEGER NOT NULL REFERENCES collectors(id) ON DELETE CASCADE,
  address VARCHAR(500) NOT NULL,
  national_id VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_households_collector ON households (collector_id);

CREATE TABLE IF NOT EXISTS collections (
  id SERIAL PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  collector_id INTEGER NOT NULL REFERENCES collectors(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status collection_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  collected_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_collections_household_date ON collections (household_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_collections_collector_date ON collections (collector_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_collections_status ON collections (status);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at);

CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expiry ON revoked_tokens (expires_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS companies_set_updated_at ON companies;
CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS collections_set_updated_at ON collections;
CREATE TRIGGER collections_set_updated_at BEFORE UPDATE ON collections
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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

CREATE INDEX IF NOT EXISTS idx_waste_bins_status ON waste_bins (status);

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
