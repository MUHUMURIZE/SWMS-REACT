BEGIN;

CREATE TABLE IF NOT EXISTS bin_fill_history (
  id BIGSERIAL PRIMARY KEY,
  bin_id INTEGER NOT NULL REFERENCES waste_bins(id) ON DELETE CASCADE,
  fill_level INTEGER NOT NULL CHECK (fill_level BETWEEN 0 AND 100),
  status bin_status NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bin_fill_history_bin_time ON bin_fill_history (bin_id, recorded_at DESC);

CREATE OR REPLACE FUNCTION record_bin_fill_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.fill_level IS DISTINCT FROM OLD.fill_level THEN
    INSERT INTO bin_fill_history (bin_id, fill_level, status)
    VALUES (NEW.id, NEW.fill_level, NEW.status);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS waste_bins_record_fill_history ON waste_bins;
CREATE TRIGGER waste_bins_record_fill_history
AFTER INSERT OR UPDATE OF fill_level, status ON waste_bins
FOR EACH ROW EXECUTE FUNCTION record_bin_fill_history();

COMMIT;
