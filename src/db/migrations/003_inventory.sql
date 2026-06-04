-- Stock fields on products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock      NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_min  NUMERIC(10,2) DEFAULT 0;

-- Link invoice items to catalog products (nullable — items not in catalog are untracked)
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id);

-- Audit trail for every stock movement
CREATE TABLE IF NOT EXISTS stock_movements (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  invoice_id  INTEGER REFERENCES invoices(id),  -- null = manual adjustment
  type        VARCHAR(15) NOT NULL,              -- 'entry' | 'exit' | 'return' | 'adjustment'
  quantity    NUMERIC(10,2) NOT NULL,            -- always positive; type defines direction
  notes       TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);
