CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  default_price NUMERIC(12,2) NOT NULL,
  unit          VARCHAR(50) DEFAULT 'unidad',
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id                 SERIAL PRIMARY KEY,
  reference          VARCHAR(50) UNIQUE NOT NULL,
  client_name        VARCHAR(255) NOT NULL,
  client_id          VARCHAR(50),
  destination_city   VARCHAR(100),
  destination_point  VARCHAR(255),
  status             VARCHAR(20) DEFAULT 'draft',
  notes              TEXT,
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id          SERIAL PRIMARY KEY,
  invoice_id  INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  quantity    NUMERIC(10,2) NOT NULL,
  unit_price  NUMERIC(12,2) NOT NULL,
  total       NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  wa_number         VARCHAR(20) PRIMARY KEY,
  active_invoice_id INTEGER REFERENCES invoices(id),
  messages          JSONB DEFAULT '[]',
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
