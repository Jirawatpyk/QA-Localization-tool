-- Override Drizzle-generated audit_logs table with partitioned version
-- Drizzle ORM does NOT support PostgreSQL table partitioning natively.
-- This migration drops the Drizzle-generated table and recreates with PARTITION BY RANGE.

-- Step 1: Drop Drizzle-generated audit_logs (and its FKs)
DROP TABLE IF EXISTS audit_logs CASCADE;

-- Step 2: Create partitioned audit_logs table
CREATE TABLE audit_logs (
  id uuid DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  entity_type varchar(100) NOT NULL,
  entity_id uuid NOT NULL,
  action varchar(100) NOT NULL,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Step 3: Primary key must include partition key
ALTER TABLE audit_logs ADD PRIMARY KEY (id, created_at);

-- Step 4: Create initial monthly partitions
CREATE TABLE audit_logs_2026_02 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE audit_logs_2026_03 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE audit_logs_2026_04 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE audit_logs_2026_05 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
