-- Migration 006: switch document reference prefix FAC- -> REM-.
-- The generated document is a delivery note (REMISIÓN), not a DIAN fiscal
-- invoice. Calling it "FACTURA" with FAC- numbering risks legal confusion in
-- Colombia, where factura de venta is regulated. See decision/document-prefix-rem.
--
-- Reuses the existing per-year sequence (invoice_seq_<year>), so numbering stays
-- monotonic and unique across the prefix change. No re-seed needed: REM- refs
-- never collide with prior FAC- refs (the UNIQUE constraint is on the full string).

CREATE OR REPLACE FUNCTION next_invoice_reference(p_year INT)
RETURNS TEXT AS $$
DECLARE
  seq_name TEXT := format('invoice_seq_%s', p_year);
  next_val BIGINT;
BEGIN
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', seq_name);
  EXECUTE format('SELECT nextval(%L)', seq_name) INTO next_val;
  RETURN format('REM-%s-%s', p_year, lpad(next_val::TEXT, 3, '0'));
END;
$$ LANGUAGE plpgsql;

-- Rollback: restore the FAC- prefix by re-applying migration 004's function body.
