BEGIN;

CREATE OR REPLACE FUNCTION enforce_collection_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('pending', 'scheduled') THEN
      RAISE EXCEPTION 'A collection must start as pending or scheduled'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'pending' AND NEW.status NOT IN ('scheduled', 'missed', 'cancelled') THEN
      RAISE EXCEPTION 'A pending collection can only become scheduled, missed, or cancelled'
        USING ERRCODE = '23514';
    ELSIF OLD.status = 'scheduled' AND NEW.status NOT IN ('in_progress', 'missed', 'cancelled') THEN
      RAISE EXCEPTION 'A scheduled collection can only become in_progress, missed, or cancelled'
        USING ERRCODE = '23514';
    ELSIF OLD.status = 'in_progress' AND NEW.status NOT IN ('collected', 'missed', 'cancelled') THEN
      RAISE EXCEPTION 'An in_progress collection can only become collected, missed, or cancelled'
        USING ERRCODE = '23514';
    ELSIF OLD.status = 'collected' AND NEW.status <> 'completed' THEN
      RAISE EXCEPTION 'A collected collection can only become completed'
        USING ERRCODE = '23514';
    ELSIF OLD.status IN ('completed', 'missed', 'cancelled') THEN
      RAISE EXCEPTION 'Terminal collection states cannot be changed'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS collections_enforce_status_transition ON collections;
CREATE TRIGGER collections_enforce_status_transition
BEFORE INSERT OR UPDATE OF status ON collections
FOR EACH ROW EXECUTE FUNCTION enforce_collection_status_transition();

COMMIT;
