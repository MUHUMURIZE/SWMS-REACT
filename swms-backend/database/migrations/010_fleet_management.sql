BEGIN;

CREATE TABLE fleet_vehicles (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  registration_number VARCHAR(32) NOT NULL,
  vehicle_type VARCHAR(32) NOT NULL,
  make VARCHAR(80),
  model VARCHAR(80),
  capacity NUMERIC(12, 2) NOT NULL CHECK (capacity > 0),
  fuel_type VARCHAR(16) NOT NULL
    CHECK (fuel_type IN ('DIESEL', 'PETROL', 'ELECTRIC', 'HYBRID', 'CNG', 'OTHER')),
  operational_status VARCHAR(16) NOT NULL DEFAULT 'AVAILABLE'
    CHECK (operational_status IN ('AVAILABLE', 'IN_SERVICE', 'MAINTENANCE', 'INACTIVE')),
  registration_expires_on DATE,
  insurance_expires_on DATE,
  inspection_expires_on DATE,
  assigned_collector_id INTEGER REFERENCES collectors(id) ON DELETE RESTRICT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((operational_status = 'IN_SERVICE') = (assigned_collector_id IS NOT NULL))
);

CREATE UNIQUE INDEX fleet_vehicles_registration_normalized_unique
  ON fleet_vehicles (company_id, LOWER(BTRIM(registration_number)));
CREATE UNIQUE INDEX fleet_vehicles_one_active_vehicle_per_collector
  ON fleet_vehicles (assigned_collector_id)
  WHERE assigned_collector_id IS NOT NULL;
CREATE INDEX fleet_vehicles_company_status ON fleet_vehicles (company_id, operational_status, id);

CREATE TRIGGER fleet_vehicles_set_updated_at
BEFORE UPDATE ON fleet_vehicles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE vehicle_assignment_history (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES fleet_vehicles(id) ON DELETE RESTRICT,
  collector_id INTEGER REFERENCES collectors(id) ON DELETE SET NULL,
  collector_name VARCHAR(160) NOT NULL,
  assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unassigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  unassigned_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX vehicle_assignment_history_one_current
  ON vehicle_assignment_history (vehicle_id)
  WHERE unassigned_at IS NULL;
CREATE INDEX vehicle_assignment_history_vehicle
  ON vehicle_assignment_history (vehicle_id, assigned_at DESC, id DESC);

CREATE TABLE vehicle_maintenance (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES fleet_vehicles(id) ON DELETE RESTRICT,
  description VARCHAR(1000) NOT NULL,
  service_provider VARCHAR(160),
  scheduled_for DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
  cost NUMERIC(12, 2) CHECK (cost IS NULL OR cost >= 0),
  odometer_km INTEGER CHECK (odometer_km IS NULL OR odometer_km >= 0),
  completed_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);

CREATE INDEX vehicle_maintenance_vehicle_schedule
  ON vehicle_maintenance (vehicle_id, scheduled_for DESC, id DESC);
CREATE INDEX vehicle_maintenance_scheduled
  ON vehicle_maintenance (status, scheduled_for);

CREATE OR REPLACE FUNCTION guard_fleet_vehicle_assignment()
RETURNS TRIGGER AS $$
DECLARE
  collector_company_id INTEGER;
  collector_district TEXT;
BEGIN
  IF NEW.assigned_collector_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.company_id, c.district
  INTO collector_company_id, collector_district
  FROM collectors c
  JOIN representatives r ON r.id = c.representative_id
  WHERE c.id = NEW.assigned_collector_id;

  IF NOT FOUND OR collector_company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'Vehicle and collector must belong to the same company'
      USING ERRCODE = '23514';
  END IF;
  IF NOT company_has_active_district(NEW.company_id, collector_district) THEN
    RAISE EXCEPTION 'Collector has no active district authorization'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.operational_status <> 'IN_SERVICE' THEN
    RAISE EXCEPTION 'An assigned vehicle must be in service'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fleet_vehicles_guard_assignment
BEFORE INSERT OR UPDATE OF company_id, assigned_collector_id, operational_status
ON fleet_vehicles
FOR EACH ROW EXECUTE FUNCTION guard_fleet_vehicle_assignment();

CREATE OR REPLACE FUNCTION release_fleet_vehicles_on_agreement_end()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'ACTIVE' AND NEW.status IN ('EXPIRED', 'SUSPENDED', 'TERMINATED') THEN
    UPDATE vehicle_assignment_history h
    SET unassigned_at = CURRENT_TIMESTAMP,
      unassigned_by = NEW.ended_by
    FROM fleet_vehicles v
    JOIN collectors c ON c.id = v.assigned_collector_id
    JOIN representatives r ON r.id = c.representative_id
    JOIN districts d ON LOWER(BTRIM(d.name)) = LOWER(BTRIM(c.district))
    WHERE h.vehicle_id = v.id
      AND h.unassigned_at IS NULL
      AND r.company_id = NEW.company_id
      AND d.id = NEW.district_id;

    UPDATE fleet_vehicles v
    SET assigned_collector_id = NULL,
      operational_status = 'AVAILABLE'
    FROM collectors c
    JOIN representatives r ON r.id = c.representative_id
    JOIN districts d ON LOWER(BTRIM(d.name)) = LOWER(BTRIM(c.district))
    WHERE v.assigned_collector_id = c.id
      AND r.company_id = NEW.company_id
      AND d.id = NEW.district_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER company_district_agreements_release_fleet
AFTER UPDATE OF status ON company_district_agreements
FOR EACH ROW EXECUTE FUNCTION release_fleet_vehicles_on_agreement_end();

COMMIT;
