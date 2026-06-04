CREATE TABLE IF NOT EXISTS clients (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(255) NOT NULL,
  client_id         VARCHAR(50),           -- NIT o cédula
  destination_city  VARCHAR(100),
  destination_point VARCHAR(255),
  active            BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMP DEFAULT NOW()
);
