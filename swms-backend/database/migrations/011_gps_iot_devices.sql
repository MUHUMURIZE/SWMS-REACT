BEGIN;

CREATE TABLE resource_devices (
  id SERIAL PRIMARY KEY,
  device_type VARCHAR(8) NOT NULL CHECK (device_type IN ('GPS', 'BIN')),
  device_code VARCHAR(128) NOT NULL UNIQUE,
  credential_hash CHAR(64) NOT NULL UNIQUE,
  vehicle_id INTEGER REFERENCES fleet_vehicles(id) ON DELETE RESTRICT,
  bin_id INTEGER REFERENCES waste_bins(id) ON DELETE RESTRICT,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  last_communication_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (device_type = 'GPS' AND bin_id IS NULL)
    OR (device_type = 'BIN' AND vehicle_id IS NULL)
  )
);

CREATE UNIQUE INDEX resource_devices_one_gps_device_per_vehicle
  ON resource_devices (vehicle_id) WHERE vehicle_id IS NOT NULL AND status = 'ACTIVE';
CREATE UNIQUE INDEX resource_devices_one_bin_device_per_bin
  ON resource_devices (bin_id) WHERE bin_id IS NOT NULL AND status = 'ACTIVE';
CREATE INDEX resource_devices_type_status ON resource_devices (device_type, status, id);
CREATE INDEX resource_devices_last_communication ON resource_devices (last_communication_at);

CREATE TRIGGER resource_devices_set_updated_at
BEFORE UPDATE ON resource_devices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE vehicle_locations (
  id BIGSERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES resource_devices(id) ON DELETE RESTRICT,
  vehicle_id INTEGER NOT NULL REFERENCES fleet_vehicles(id) ON DELETE RESTRICT,
  message_id VARCHAR(128) NOT NULL,
  latitude NUMERIC(10, 7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(10, 7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  speed NUMERIC(8, 2) CHECK (speed IS NULL OR speed BETWEEN 0 AND 500),
  heading NUMERIC(6, 2) CHECK (heading IS NULL OR heading >= 0 AND heading < 360),
  accuracy NUMERIC(8, 2) CHECK (accuracy IS NULL OR accuracy >= 0),
  recorded_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (device_id, message_id)
);

CREATE INDEX vehicle_locations_vehicle_time
  ON vehicle_locations (vehicle_id, recorded_at DESC, id DESC);
CREATE INDEX vehicle_locations_device_received
  ON vehicle_locations (device_id, received_at DESC);

CREATE TABLE bin_sensor_readings (
  id BIGSERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES resource_devices(id) ON DELETE RESTRICT,
  bin_id INTEGER NOT NULL REFERENCES waste_bins(id) ON DELETE RESTRICT,
  message_id VARCHAR(128) NOT NULL,
  fill_level NUMERIC(5, 2) NOT NULL CHECK (fill_level BETWEEN 0 AND 100),
  battery_level SMALLINT CHECK (battery_level IS NULL OR battery_level BETWEEN 0 AND 100),
  sensor_status VARCHAR(16) NOT NULL CHECK (sensor_status IN ('OK', 'DEGRADED', 'FAULT')),
  overflow_detected BOOLEAN,
  measured_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (device_id, message_id)
);

CREATE INDEX bin_sensor_readings_bin_time
  ON bin_sensor_readings (bin_id, measured_at DESC, id DESC);
CREATE INDEX bin_sensor_readings_device_received
  ON bin_sensor_readings (device_id, received_at DESC);
CREATE INDEX bin_sensor_readings_overflow
  ON bin_sensor_readings (bin_id, measured_at DESC)
  WHERE overflow_detected IS TRUE;

COMMIT;
