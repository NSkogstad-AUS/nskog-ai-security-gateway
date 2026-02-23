-- Migration 001: create append-only events table
-- This table is intentionally INSERT-only; no UPDATE or DELETE paths exist.

CREATE TABLE IF NOT EXISTS events (
  id             UUID        PRIMARY KEY,
  correlation_id TEXT        NOT NULL,
  event_type     TEXT        NOT NULL,
  ts             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload        JSONB       NOT NULL
);

-- Efficient lookup by correlation chain (e.g. fetch all events for a request)
CREATE INDEX IF NOT EXISTS idx_events_correlation_id
  ON events (correlation_id);

-- Efficient time-range queries and chronological ordering
CREATE INDEX IF NOT EXISTS idx_events_ts
  ON events (ts DESC);
