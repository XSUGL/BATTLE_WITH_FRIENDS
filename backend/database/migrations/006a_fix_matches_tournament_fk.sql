-- Migration 006a: completa la 006 quando le colonne di matches esistono già
-- (es. da un run precedente fallito a metà). Aggiunge SOLO le parti mancanti:
--   - colonne tournament_id/round/bracket_slot (se mancano)
--   - index idx_matches_tournament (se manca)
--   - FK fk_matches_tournament (se manca)
--
-- Sicuro da rieseguire più volte: tutte le aggiunte sono guardate da
-- information_schema. Da eseguire come la 006:
--   mysql -h ... -u ... -p... <db> < 006a_fix_matches_tournament_fk.sql

DELIMITER //

DROP PROCEDURE IF EXISTS _fix_matches_tournament //
CREATE PROCEDURE _fix_matches_tournament()
BEGIN
  DECLARE has_col INT DEFAULT 0;
  DECLARE has_idx INT DEFAULT 0;
  DECLARE has_fk  INT DEFAULT 0;

  -- ── tournament_id ──
  SELECT COUNT(*) INTO has_col FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'tournament_id';
  IF has_col = 0 THEN
    ALTER TABLE matches ADD COLUMN tournament_id INT NULL AFTER status;
  END IF;

  -- ── round ──
  SELECT COUNT(*) INTO has_col FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'round';
  IF has_col = 0 THEN
    ALTER TABLE matches ADD COLUMN round INT NULL AFTER tournament_id;
  END IF;

  -- ── bracket_slot ──
  SELECT COUNT(*) INTO has_col FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'bracket_slot';
  IF has_col = 0 THEN
    ALTER TABLE matches ADD COLUMN bracket_slot INT NULL
      COMMENT 'indice match nel round, 0-based' AFTER round;
  END IF;

  -- ── index idx_matches_tournament ──
  SELECT COUNT(*) INTO has_idx FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND INDEX_NAME = 'idx_matches_tournament';
  IF has_idx = 0 THEN
    ALTER TABLE matches ADD INDEX idx_matches_tournament (tournament_id, round);
  END IF;

  -- ── FK fk_matches_tournament ──
  SELECT COUNT(*) INTO has_fk FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches'
      AND CONSTRAINT_NAME = 'fk_matches_tournament' AND CONSTRAINT_TYPE = 'FOREIGN KEY';
  IF has_fk = 0 THEN
    ALTER TABLE matches ADD CONSTRAINT fk_matches_tournament
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL;
  END IF;
END //

DELIMITER ;

CALL _fix_matches_tournament();
DROP PROCEDURE IF EXISTS _fix_matches_tournament;
