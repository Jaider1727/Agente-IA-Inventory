-- Migration 004: atomic per-year invoice reference allocation
-- Uses a lazily-created per-year sequence; safe to re-run (CREATE OR REPLACE + IF NOT EXISTS).

CREATE OR REPLACE FUNCTION next_invoice_reference(p_year INT)
RETURNS TEXT AS $$
DECLARE
  seq_name TEXT := format('invoice_seq_%s', p_year);
  next_val BIGINT;
BEGIN
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', seq_name);
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_val;
  RETURN format('FAC-%s-%s', p_year, lpad(next_val::TEXT, 3, '0'));
END;
$$ LANGUAGE plpgsql;

-- Seed the current-year sequence from existing invoices to prevent
-- collisions with pre-migration rows.
-- Guard: only calls setval when the sequence is still at 1 (first-run safe).
DO $$
DECLARE
  cur_year   INT  := EXTRACT(YEAR FROM NOW())::INT;
  seq_name   TEXT := format('invoice_seq_%s', cur_year);
  max_nnn    INT;
  cur_val    BIGINT;
BEGIN
  -- Ensure the sequence exists before we inspect or seed it.
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', seq_name);

  -- Find the highest NNN already in use for the current year.
  SELECT MAX(SPLIT_PART(reference, '-', 3)::INT)
    INTO max_nnn
    FROM invoices
   WHERE reference LIKE format('FAC-%s-%%', cur_year);

  -- Only seed when there are existing rows AND the sequence has not advanced yet.
  IF max_nnn IS NOT NULL THEN
    EXECUTE format('SELECT last_value FROM %I', seq_name) INTO cur_val;
    IF cur_val = 1 THEN
      EXECUTE format('SELECT setval(%L, %s)', seq_name, max_nnn);
    END IF;
  END IF;
END;
$$;

-- Rollback: DROP FUNCTION IF EXISTS next_invoice_reference(INT);
-- Rollback: DROP SEQUENCE IF EXISTS invoice_seq_<year>;  (one per year that was created)
