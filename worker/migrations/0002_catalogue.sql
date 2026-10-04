-- Admin accounts manage the shared catalogue (catalogue/* keys in R2).
-- Grants: the first account created on a fresh worker, an ADMIN_EMAIL
-- (comma-separated) match at login, or a direct is_admin UPDATE here.
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
