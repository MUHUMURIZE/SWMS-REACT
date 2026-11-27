BEGIN;

ALTER TABLE households
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS location_accuracy NUMERIC(8, 2) CHECK (location_accuracy IS NULL OR location_accuracy >= 0),
  ADD COLUMN IF NOT EXISTS location_captured_at TIMESTAMPTZ,
  ADD CONSTRAINT households_lat_lng_pair CHECK ((latitude IS NULL) = (longitude IS NULL));

ALTER TABLE waste_bins
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS location_accuracy NUMERIC(8, 2) CHECK (location_accuracy IS NULL OR location_accuracy >= 0),
  ADD COLUMN IF NOT EXISTS location_captured_at TIMESTAMPTZ,
  ADD CONSTRAINT waste_bins_lat_lng_pair CHECK ((latitude IS NULL) = (longitude IS NULL));

CREATE INDEX IF NOT EXISTS idx_waste_bins_coordinates
  ON waste_bins (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

ALTER TABLE resource_devices
  ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE vehicle_locations
  ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE bin_sensor_readings
  ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS resource_devices_simulated_idx
  ON resource_devices (device_type, is_simulated, status);

COMMIT;
