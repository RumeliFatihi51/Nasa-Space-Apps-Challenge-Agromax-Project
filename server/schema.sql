-- AgroMax Physical Database Schema (SQLite / PostgreSQL)

-- 1. User Accounts
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  password TEXT
);

-- 2. User Sessions & Authentication
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT,
  expires BIGINT
);
CREATE INDEX IF NOT EXISTS sessions_owner ON sessions(user_id);

-- 3. Farm Records (Parcels, GeoJSON geometries, Crop details, Field notes)
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  kind TEXT,
  body TEXT
);
CREATE INDEX IF NOT EXISTS records_owner ON records(user_id);

-- 4. Satellite Observations & Spectral Analyses Memory
CREATE TABLE IF NOT EXISTS analyses (
  field_id TEXT PRIMARY KEY,
  geometry_hash TEXT,
  body TEXT
);

-- 5. Rate Limits & Security Boundaries
CREATE TABLE IF NOT EXISTS auth_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  started_at BIGINT NOT NULL
);
