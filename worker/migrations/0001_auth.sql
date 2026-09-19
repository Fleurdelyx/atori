-- atori-auth schema: accounts, sessions, favorites, cloud playlists
CREATE TABLE users (
  id       TEXT PRIMARY KEY,
  email    TEXT UNIQUE NOT NULL,
  name     TEXT NOT NULL,
  pw_hash  TEXT NOT NULL,
  pw_salt  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE favorites (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_key TEXT NOT NULL,
  added_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, track_key)
);

CREATE TABLE playlists (
  id         TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  track_keys TEXT NOT NULL, -- JSON array of R2 object keys
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
