BEGIN;

CREATE OR REPLACE FUNCTION company_has_active_district(company_id_input INTEGER, district_name_input TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(
    district_name_input IS NOT NULL
    AND BTRIM(district_name_input) <> ''
    AND EXISTS (
      SELECT 1
      FROM company_district_agreements a
      JOIN districts d ON d.id = a.district_id
      WHERE a.company_id = company_id_input
        AND a.status = 'ACTIVE'
        AND a.starts_on <= CURRENT_DATE
        AND (a.ends_on IS NULL OR a.ends_on >= CURRENT_DATE)
        AND LOWER(BTRIM(d.name)) = LOWER(BTRIM(district_name_input))
    ),
    FALSE
  );
$$;

COMMIT;
