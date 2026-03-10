-- Migration 005: Add activated_at to matches table
-- Align with MVP spec: matches.activated_at timestamp when match becomes active

ALTER TABLE matches
  ADD COLUMN activated_at TIMESTAMP NULL DEFAULT NULL AFTER winner_id;

CREATE INDEX idx_matches_activated_at ON matches (activated_at);

