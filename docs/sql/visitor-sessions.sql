-- Apply separately to the production and preview MEASUREMENT_DB databases.
-- No form data, IPs, user agents, raw referrers, or persistent visitor IDs.
CREATE TABLE IF NOT EXISTS measurement_sessions (
  id_hash TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  source TEXT NOT NULL,
  medium TEXT NOT NULL,
  campaign TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS measurement_session_expiry ON measurement_sessions(started_at);
CREATE TABLE IF NOT EXISTS measurement_events (
  session_hash TEXT NOT NULL REFERENCES measurement_sessions(id_hash) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  PRIMARY KEY (session_hash, event_name)
);
