BEGIN;

ALTER TYPE collection_status ADD VALUE IF NOT EXISTS 'cancelled';

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(128),
  reason TEXT,
  ip_address INET,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs (resource_type, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collections_status_scheduled ON collections (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_households_user ON households (user_id);
CREATE INDEX IF NOT EXISTS idx_collectors_user ON collectors (user_id);
CREATE INDEX IF NOT EXISTS idx_representatives_user ON representatives (user_id);

CREATE OR REPLACE FUNCTION enforce_collection_relationship()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM households h
    WHERE h.id = NEW.household_id
      AND h.collector_id = NEW.collector_id
  ) THEN
    RAISE EXCEPTION 'The collection collector must match the household collector'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS collections_enforce_relationship ON collections;
CREATE TRIGGER collections_enforce_relationship
BEFORE INSERT OR UPDATE OF household_id, collector_id ON collections
FOR EACH ROW EXECUTE FUNCTION enforce_collection_relationship();

CREATE OR REPLACE FUNCTION enforce_collection_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'pending' AND NEW.status NOT IN ('scheduled', 'missed', 'cancelled') THEN
      RAISE EXCEPTION 'A pending collection can only become scheduled or missed'
        USING ERRCODE = '23514';
    END IF;
    IF OLD.status = 'scheduled' AND NEW.status NOT IN ('in_progress', 'missed', 'cancelled') THEN
      RAISE EXCEPTION 'A scheduled collection can only become in_progress or missed'
        USING ERRCODE = '23514';
    END IF;
    IF OLD.status = 'in_progress' AND NEW.status NOT IN ('collected', 'missed', 'cancelled') THEN
      RAISE EXCEPTION 'An in_progress collection can only become collected or missed'
        USING ERRCODE = '23514';
    END IF;
    IF OLD.status = 'collected' AND NEW.status = 'completed' THEN
      -- collected pickups may complete their workflow
      RETURN NEW;
    END IF;
    IF OLD.status IN ('completed', 'missed', 'cancelled') THEN
      RAISE EXCEPTION 'Terminal collection states cannot be changed'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS collections_enforce_status_transition ON collections;
CREATE TRIGGER collections_enforce_status_transition
BEFORE UPDATE OF status ON collections
FOR EACH ROW EXECUTE FUNCTION enforce_collection_status_transition();

CREATE OR REPLACE FUNCTION enforce_bin_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'MAINTENANCE' THEN
    RETURN NEW;
  END IF;
  IF NEW.fill_level = 0 THEN
    NEW.status = 'EMPTY';
  ELSIF NEW.fill_level < 50 THEN
    NEW.status = 'LOW';
  ELSIF NEW.fill_level < 80 THEN
    NEW.status = 'MEDIUM';
  ELSIF NEW.fill_level < 100 THEN
    NEW.status = 'HIGH';
  ELSE
    NEW.status = 'FULL';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS waste_bins_enforce_status ON waste_bins;
CREATE TRIGGER waste_bins_enforce_status
BEFORE INSERT OR UPDATE OF fill_level, status ON waste_bins
FOR EACH ROW EXECUTE FUNCTION enforce_bin_status();

COMMIT;
